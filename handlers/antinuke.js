const { 
    AuditLogEvent, 
    PermissionFlagsBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    ButtonBuilder, 
    ButtonStyle 
} = require('discord.js');
const ModerationConfig = require('../models/moderation');

const DANGEROUS_PERMS = [
    PermissionFlagsBits.Administrator,
    PermissionFlagsBits.ManageGuild,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.BanMembers,
    PermissionFlagsBits.KickMembers
];

const pendingBots = new Map(); // botId -> { timeout, guildId }

async function logAction(guild, config, title, description, color = '#ED4245') {
    if (!config?.modLogsChannelId) return;
    const channel = guild.channels.cache.get(config.modLogsChannelId);
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(description)
        .setTimestamp();
    await channel.send({ embeds: [embed] }).catch(() => {});
}

// Temporary alert for unauthorized prefix commands (Self-cleaning)
async function sendTempDenial(message, text) {
    await message.delete().catch(() => {});
    const reply = await message.channel.send(`⚠️ <@${message.author.id}>, ${text}`);
    setTimeout(() => reply.delete().catch(() => {}), 3500);
}

module.exports = (client) => {

    // 1. Unauthorized Bot Add & 30-Second Timer
    client.on('guildMemberAdd', async (member) => {
        if (!member.user.bot) return;

        const config = await ModerationConfig.findOne({ guildId: member.guild.id });
        if (!config || !config.antiNukeEnabled) return;

        // Ensure array safety
        if (!Array.isArray(config.whitelistedBots)) config.whitelistedBots = [];
        if (!Array.isArray(config.extraOwners)) config.extraOwners = [];

        const auditLogs = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.BotAdd }).catch(() => null);
        const entry = auditLogs?.entries.first();
        const executor = entry?.executor;

        const isServerOwner = executor?.id === member.guild.ownerId;
        const isExtraOwner = config.extraOwners.includes(executor?.id);

        // Agar bot add karne wala Server Owner ya Extra Owner nahi hai, turant bot ban aur inviter punish
        if (!isServerOwner && !isExtraOwner) {
            await member.ban({ reason: '🛡️ Anti-Nuke: Unauthorized Bot Addition' }).catch(() => {});

            if (executor) {
                const executorMember = await member.guild.members.fetch(executor.id).catch(() => null);
                if (executorMember && executor.id !== member.guild.ownerId) {
                    const dangerousRoles = executorMember.roles.cache.filter(r => 
                        r.permissions.has(PermissionFlagsBits.Administrator) ||
                        r.permissions.has(PermissionFlagsBits.ManageGuild) ||
                        r.permissions.has(PermissionFlagsBits.ManageRoles)
                    );
                    if (dangerousRoles.size > 0) {
                        await executorMember.roles.remove(dangerousRoles).catch(() => {});
                    }
                    await executorMember.ban({ reason: '🛡️ Anti-Nuke: Unauthorized Bot Inviter' }).catch(() => {});
                }
            }

            await logAction(
                member.guild, 
                config, 
                '🚨 Anti-Nuke: Unauthorized Bot Blocked', 
                `**Bot:** ${member.user.tag} (\`${member.id}\`)\n**Invited By:** ${executor ? `<@${executor.id}>` : 'Unknown'}\n**Action Taken:** Bot Banned & Inviter Punished.`
            );
            return;
        }

        // Agar Server Owner ya Extra Owner ne add kiya hai, toh 30 Seconds ka timer start
        const timeout = setTimeout(async () => {
            const currentConfig = await ModerationConfig.findOne({ guildId: member.guild.id });
            const isWhitelisted = currentConfig?.whitelistedBots?.includes(member.id);

            if (!isWhitelisted) {
                await member.ban({ reason: '🛡️ Anti-Nuke: Bot not whitelisted within 30 seconds' }).catch(() => {});
                await logAction(
                    member.guild, 
                    config, 
                    '⏳ Anti-Nuke: Bot Auto-Banned', 
                    `**Bot:** ${member.user.tag} was not whitelisted within **30 seconds** and has been banned.`
                );
            }
            pendingBots.delete(member.id);
        }, 30000); // 30 seconds

        pendingBots.set(member.id, { timeout, guildId: member.guild.id });
    });

    // 2. Instant Bot Nuke Killer
    const checkBotAction = async (guild, auditType) => {
        const config = await ModerationConfig.findOne({ guildId: guild.id });
        if (!config || !config.antiNukeEnabled) return;

        const auditLogs = await guild.fetchAuditLogs({ limit: 1, type: auditType }).catch(() => null);
        const entry = auditLogs?.entries.first();
        if (!entry) return;

        const executor = entry.executor;
        if (!executor || executor.id === client.user.id) return;

        const isWhitelisted = (config.whitelistedBots || []).includes(executor.id) || 
                              (config.whitelistedUsers || []).includes(executor.id) || 
                              (config.extraOwners || []).includes(executor.id) || 
                              executor.id === guild.ownerId;

        if (!isWhitelisted) {
            const member = await guild.members.fetch(executor.id).catch(() => null);
            if (member) {
                await member.ban({ reason: '🛡️ Anti-Nuke: Unauthorized Rapid Action Defense' }).catch(() => {});
                await logAction(
                    guild, 
                    config, 
                    '🚨 Anti-Nuke: Malicious Bot Terminated', 
                    `**Offender:** <@${executor.id}> (\`${executor.tag}\`)\n**Action:** Detected harmful rapid action and banned instantly.`
                );
            }
        }
    };

    client.on('channelDelete', (ch) => ch.guild && checkBotAction(ch.guild, AuditLogEvent.ChannelDelete));
    client.on('channelCreate', (ch) => ch.guild && checkBotAction(ch.guild, AuditLogEvent.ChannelCreate));
    client.on('roleDelete', (role) => role.guild && checkBotAction(role.guild, AuditLogEvent.RoleDelete));
    client.on('roleCreate', (role) => role.guild && checkBotAction(role.guild, AuditLogEvent.RoleCreate));
    client.on('guildBanAdd', (ban) => ban.guild && checkBotAction(ban.guild, AuditLogEvent.MemberBanAdd));
    client.on('guildMemberRemove', (member) => member.guild && checkBotAction(member.guild, AuditLogEvent.MemberKick));

    // 3. Dangerous Role Protection
    client.on('guildMemberUpdate', async (oldMember, newMember) => {
        const config = await ModerationConfig.findOne({ guildId: newMember.guild.id });
        if (!config || !config.antiNukeEnabled) return;

        const isWhitelisted = (config.whitelistedUsers || []).includes(newMember.id) || 
                              (config.extraOwners || []).includes(newMember.id) || 
                              newMember.id === newMember.guild.ownerId;

        if (!isWhitelisted) {
            const hasDangerous = newMember.roles.cache.some(role => 
                DANGEROUS_PERMS.some(perm => role.permissions.has(perm))
            );

            if (hasDangerous) {
                const safeRoles = newMember.roles.cache.filter(role => 
                    !DANGEROUS_PERMS.some(perm => role.permissions.has(perm))
                );
                await newMember.roles.set(safeRoles).catch(() => {});
                await logAction(
                    newMember.guild, 
                    config, 
                    '🛡️ Anti-Nuke: Dangerous Role Quarantined', 
                    `Dangerous permissions removed from <@${newMember.id}> (Not Whitelisted).`,
                    '#FFA500'
                );
            }
        }
    });

    // 4. Prefix Commands Engine
    client.on('messageCreate', async (message) => {
        if (message.author.bot || !message.guild || !message.content.startsWith('%')) return;

        const args = message.content.slice(1).trim().split(/ +/);
        const cmd = args.shift()?.toLowerCase();
        let config = await ModerationConfig.findOne({ guildId: message.guild.id });
        if (!config) config = await ModerationConfig.create({ guildId: message.guild.id });

        if (!Array.isArray(config.extraOwners)) config.extraOwners = [];
        if (!Array.isArray(config.whitelistedBots)) config.whitelistedBots = [];
        if (!Array.isArray(config.whitelistedUsers)) config.whitelistedUsers = [];

        const isOwner = message.author.id === message.guild.ownerId;
        const isExtraOwner = config.extraOwners.includes(message.author.id);

        // A. Anti-Nuke Toggle (%antinuke enable/disable)
        if (cmd === 'antinuke') {
            if (!isOwner && !isExtraOwner) {
                return sendTempDenial(message, 'you do not have permission to configure Anti-Nuke.');
            }
            const state = args[0]?.toLowerCase();
            if (state === 'enable') {
                config.antiNukeEnabled = true;
                await config.save();
                return message.reply('✅ Anti-Nuke protection has been **ENABLED**.');
            } else if (state === 'disable') {
                config.antiNukeEnabled = false;
                await config.save();
                return message.reply('⚠️ Anti-Nuke protection has been **DISABLED**.');
            }
            return message.reply(`Anti-Nuke is currently **${config.antiNukeEnabled ? 'ENABLED' : 'DISABLED'}**.`);
        }

        // B. Extra Owner Management (%extraowner add/remove @user or ID)
        if (cmd === 'extraowner') {
            if (!isOwner) {
                return sendTempDenial(message, 'only the Server Owner can manage Extra Owners.');
            }
            const sub = args[0]?.toLowerCase();
            const rawTarget = args[1]?.replace(/[<@!>]/g, '');

            if (!['add', 'remove'].includes(sub) || !rawTarget) {
                return message.reply('❌ Usage: `%extraowner add @user` or `%extraowner remove @user`');
            }

            const target = await client.users.fetch(rawTarget).catch(() => null);
            if (!target) return message.reply('❌ User not found.');

            if (sub === 'add') {
                if (config.extraOwners.includes(target.id)) return message.reply('⚠️ User is already an Extra Owner.');
                config.extraOwners.push(target.id);
                config.markModified('extraOwners');
                await config.save();
                return message.reply(`✅ <@${target.id}> is now registered as an **Extra Owner**.`);
            } else if (sub === 'remove') {
                config.extraOwners = config.extraOwners.filter(id => id !== target.id);
                config.markModified('extraOwners');
                await config.save();
                return message.reply(`❌ Removed <@${target.id}> from Extra Owners.`);
            }
        }

        // C. Whitelist Management (%wl add/remove @user/bot or ID)
        if (cmd === 'wl') {
            if (!isOwner && !isExtraOwner) {
                return sendTempDenial(message, 'only Server Owner and Extra Owners can manage Whitelist.');
            }

            const sub = args[0]?.toLowerCase();
            const rawTarget = args[1]?.replace(/[<@!>]/g, '');

            if (!['add', 'remove'].includes(sub) || !rawTarget) {
                return message.reply('❌ Usage: `%wl add @user/bot` ya `%wl add <ID>`');
            }

            const target = await client.users.fetch(rawTarget).catch(() => null);
            if (!target) {
                return message.reply('❌ Invalid ID/User. User ya Bot find nahi hua.');
            }

            const isBot = target.bot;
            const targetArray = isBot ? 'whitelistedBots' : 'whitelistedUsers';

            if (sub === 'add') {
                if (config[targetArray].includes(target.id)) {
                    return message.reply(`⚠️ <@${target.id}> pehle se hi Whitelisted hai.`);
                }

                config[targetArray].push(target.id);
                config.markModified(targetArray);
                await config.save();

                // 30 seconds auto-ban pending timer cancel karein
                if (isBot && pendingBots.has(target.id)) {
                    clearTimeout(pendingBots.get(target.id).timeout);
                    pendingBots.delete(target.id);
                }

                return message.reply(`✅ <@${target.id}> (${isBot ? 'Bot' : 'User'}) successfully **Whitelisted** ho gaya hai!`);
            } else if (sub === 'remove') {
                if (!config[targetArray].includes(target.id)) {
                    return message.reply(`⚠️ <@${target.id}> Whitelist me nahi hai.`);
                }

                config[targetArray] = config[targetArray].filter(id => id !== target.id);
                config.markModified(targetArray);
                await config.save();

                return message.reply(`❌ <@${target.id}> ko Whitelist se remove kar diya gaya.`);
            }
        }

        // D. Permission Control Panel (%pr @user)
        if (cmd === 'pr') {
            if (!isOwner && !isExtraOwner) {
                return sendTempDenial(message, 'only Server Owner or Extra Owners can modify command permissions.');
            }
            const target = message.mentions.members.first();
            if (!target) return message.reply('Usage: `%pr @user`');

            const availablePerms = ['kick', 'ban', 'unban', 'timeout', 'untimeout', 'purge', 'role_add', 'role_remove', 'warn', 'slowmode', 'lock', 'unlock'];
            const currentPerms = config.userModPerms.get(target.id) || [];

            const options = availablePerms.map(p => ({
                label: p.replace('_', ' ').toUpperCase(),
                value: p,
                description: `Allow user to use /staff ${p}`,
                default: currentPerms.includes(p)
            }));

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`pr_select_${target.id}`)
                .setPlaceholder('Select permissions to grant...')
                .setMinValues(0)
                .setMaxValues(options.length)
                .addOptions(options);

            const row = new ActionRowBuilder().addComponents(selectMenu);
            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle(`🛡️ Permission Control: ${target.user.tag}`)
                .setDescription('Select all moderation commands this user is allowed to execute.')
                .addFields({ name: 'Active Permissions', value: currentPerms.length > 0 ? currentPerms.join(', ') : 'None' });

            await message.reply({ embeds: [embed], components: [row] });
        }

        // E. Channel Automod Overrides (%channel allow/deny links/media/ips)
        if (cmd === 'channel') {
            if (!isOwner && !isExtraOwner) {
                return sendTempDenial(message, 'only Server Owner or Extra Owners can configure channel rules.');
            }
            const action = args[0]?.toLowerCase();
            const feature = args[1]?.toLowerCase();

            if (!['allow', 'deny'].includes(action) || !['links', 'media', 'ips'].includes(feature)) {
                return message.reply('Usage: `%channel allow links` | `%channel deny media` | `%channel allow ips`');
            }

            const channelId = message.channel.id;
            const current = config.channelOverrides.get(channelId) || {};
            const state = action === 'allow';

            if (feature === 'links') current.allowLinks = state;
            if (feature === 'media') current.allowMedia = state;
            if (feature === 'ips') current.allowIps = state;

            config.channelOverrides.set(channelId, current);
            await config.save();

            return message.reply(`✅ Channel <#${channelId}> now set to **${action.toUpperCase()}** ${feature}.`);
        }
    });

    // 5. Handle %pr Dropdown Selection
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isStringSelectMenu() || !interaction.customId.startsWith('pr_select_')) return;
        const targetUserId = interaction.customId.replace('pr_select_', '');

        const config = await ModerationConfig.findOne({ guildId: interaction.guild.id }) || new ModerationConfig({ guildId: interaction.guild.id });
        config.userModPerms.set(targetUserId, interaction.values);
        await config.save();

        const updatedEmbed = new EmbedBuilder()
            .setColor('#2ECC71')
            .setTitle(`✅ Permissions Updated: <@${targetUserId}>`)
            .setDescription(`**Granted Commands:**\n${interaction.values.length > 0 ? interaction.values.map(v => `• \`${v}\``).join('\n') : '*No permissions assigned*'}`);

        const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('pr_confirmed')
                .setLabel('Permissions Saved')
                .setEmoji('<a:CONFIRM:1540171582817968148>')
                .setStyle(ButtonStyle.Success)
                .setDisabled(true)
        );

        await interaction.update({ embeds: [updatedEmbed], components: [confirmRow] });
    });

    console.log('✔ Anti-Nuke & Permission Handler loaded.');
};
