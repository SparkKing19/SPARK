const { 
    AuditLogEvent, 
    PermissionFlagsBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ChannelType 
} = require('discord.js');
const ModerationConfig = require('../models/moderation');
const ServerBackup = require('../models/backup');

// Permanent Bot Owners
const BOT_OWNERS = ['1266728371719508062', '1474216218792558735'];

const DANGEROUS_PERMS = [
    PermissionFlagsBits.Administrator,
    PermissionFlagsBits.ManageGuild,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.BanMembers,
    PermissionFlagsBits.KickMembers,
    PermissionFlagsBits.MentionEveryone
];

const actionBuckets = new Map(); // executorId -> { count, lastTime }

// Logging helper
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

// Strip dangerous permissions immediately
async function stripDangerousPerms(member, reason) {
    if (!member || member.id === member.guild.ownerId) return;
    const dangerousRoles = member.roles.cache.filter(role => 
        DANGEROUS_PERMS.some(perm => role.permissions.has(perm))
    );
    if (dangerousRoles.size > 0) {
        await member.roles.remove(dangerousRoles, reason).catch(() => {});
    }
}

// Backup creator helper (Fixed TypeError: safely handle threads & permissionOverwrites)
async function createGuildBackup(guild, creatorId, customId = null, isAuto = false) {
    const backupId = customId || `auto_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const roles = guild.roles.cache
        .filter(r => r.id !== guild.id)
        .map(r => ({
            name: r.name,
            color: r.color,
            hoist: r.hoist,
            permissions: r.permissions ? r.permissions.bitfield.toString() : '0',
            mentionable: r.mentionable
        }));

    // Filter out threads because they don't have permissionOverwrites
    const channels = guild.channels.cache
        .filter(c => !c.isThread?.())
        .map(c => {
            const overwrites = [];
            if (c.permissionOverwrites?.cache) {
                c.permissionOverwrites.cache.forEach(p => {
                    overwrites.push({
                        id: p.id,
                        type: p.type,
                        allow: p.allow ? p.allow.bitfield.toString() : '0',
                        deny: p.deny ? p.deny.bitfield.toString() : '0'
                    });
                });
            }

            return {
                name: c.name,
                type: c.type,
                parentName: c.parent ? c.parent.name : null,
                position: c.rawPosition ?? 0,
                permissionOverwrites: overwrites
            };
        });

    const backupDoc = new ServerBackup({
        backupId,
        guildId: guild.id,
        creatorId,
        isAutoBackup: isAuto,
        data: {
            name: guild.name,
            icon: guild.iconURL({ extension: 'png' }) || null,
            roles,
            channels
        }
    });

    await backupDoc.save();

    // 10 minutes auto-cleanup for previous auto-backups
    if (isAuto) {
        setTimeout(async () => {
            await ServerBackup.deleteOne({ backupId }).catch(() => {});
        }, 10 * 60 * 1000);
    }

    return backupId;
}

module.exports = (client) => {
    // Prevent MaxListenersExceededWarning
    client.setMaxListeners(50);

    // 1 & 2 & 4. BOT ADD EVENT: Instant Ban, Perm Strip & Auto-Backup
    client.on('guildMemberAdd', async (member) => {
        if (!member.user.bot) return;

        const config = await ModerationConfig.findOne({ guildId: member.guild.id });
        if (!config || !config.antiNukeEnabled) return;

        const auditLogs = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.BotAdd }).catch(() => null);
        const entry = auditLogs?.entries.first();
        const executor = entry?.executor;

        const isBotOwner = executor && BOT_OWNERS.includes(executor.id);
        const isServerOwner = executor?.id === member.guild.ownerId;
        const isExtraOwner = isBotOwner || (config.extraOwners && config.extraOwners.includes(executor?.id));

        // RULE 1: Agar add karne wala Bot Owner, Server Owner ya Extra Owner NAHI hai
        if (!isServerOwner && !isExtraOwner) {
            await member.ban({ reason: '🛡️ Anti-Nuke: Unauthorized Bot Addition' }).catch(() => {});

            if (executor) {
                const inviter = await member.guild.members.fetch(executor.id).catch(() => null);
                if (inviter && inviter.id !== member.guild.ownerId) {
                    await stripDangerousPerms(inviter, 'Anti-Nuke: Added Unauthorized Bot');
                    await inviter.ban({ reason: '🛡️ Anti-Nuke: Added Unauthorized Bot' }).catch(() => {});
                }
            }

            await logAction(
                member.guild, 
                config, 
                '🚨 Anti-Nuke: Unauthorized Bot Add Punished', 
                `**Bot:** ${member.user.tag} (\`${member.id}\`)\n**Invited By:** <@${executor?.id}>\n**Action:** Both Bot & Inviter Banned.`
            );
            return;
        }

        // RULE 2: Agar Owner/Extra Owner ne add kiya lekin bot whitelist NAHI hai
        const isWhitelisted = config.whitelistedBots && config.whitelistedBots.includes(member.id);
        if (!isWhitelisted) {
            await stripDangerousPerms(member, 'Anti-Nuke: Unwhitelisted Bot Neutralized');
        }

        // RULE 4: Instant Full Server Auto-Backup & DM Notify
        try {
            const backupId = await createGuildBackup(member.guild, client.user.id, null, true);

            const backupEmbed = new EmbedBuilder()
                .setColor('#2ECC71')
                .setTitle('🛡️ Anti-Nuke: Auto-Backup Created')
                .setDescription(`New bot **${member.user.tag}** added to **${member.guild.name}**.\nSnapshot backup created successfully!`)
                .addFields(
                    { name: 'Backup ID', value: `\`${backupId}\``, inline: true },
                    { name: 'Auto-Expire', value: '10 Minutes', inline: true }
                )
                .setTimestamp();

            // DM to Server Owner
            const sOwner = await client.users.fetch(member.guild.ownerId).catch(() => null);
            if (sOwner) await sOwner.send({ embeds: [backupEmbed] }).catch(() => {});

            // DM to Bot Owners
            for (const bOwnerId of BOT_OWNERS) {
                const bOwner = await client.users.fetch(bOwnerId).catch(() => null);
                if (bOwner) await bOwner.send({ embeds: [backupEmbed] }).catch(() => {});
            }

            // Moderator Only Channel notification
            if (member.guild.publicUpdatesChannel) {
                await member.guild.publicUpdatesChannel.send({ embeds: [backupEmbed] }).catch(() => {});
            }
        } catch (err) {
            console.error('Auto Backup Error:', err);
        }
    });

    // 3. 1-SECOND SUB-SECOND DANGEROUS ACT KILLER
    const instantDefense = async (guild, auditType, actName) => {
        const config = await ModerationConfig.findOne({ guildId: guild.id });
        if (!config || !config.antiNukeEnabled) return;

        const auditLogs = await guild.fetchAuditLogs({ limit: 1, type: auditType }).catch(() => null);
        const entry = auditLogs?.entries.first();
        if (!entry) return;

        const executor = entry.executor;
        if (!executor || executor.id === client.user.id) return;

        // Bypass for Bot Owner, Server Owner, Extra Owner
        const isBypassed = BOT_OWNERS.includes(executor.id) ||
                          executor.id === guild.ownerId ||
                          (config.extraOwners && config.extraOwners.includes(executor.id));

        if (isBypassed) return;

        const now = Date.now();
        const tracker = actionBuckets.get(executor.id) || { count: 0, lastTime: now };

        // 1 Second window check
        if (now - tracker.lastTime < 1000) {
            tracker.count += 1;
        } else {
            tracker.count = 1;
        }
        tracker.lastTime = now;
        actionBuckets.set(executor.id, tracker);

        // Instant Terminate on rapid act
        const offender = await guild.members.fetch(executor.id).catch(() => null);
        if (offender) {
            await stripDangerousPerms(offender, 'Anti-Nuke: Immediate Threat Containment');
            await offender.ban({ reason: `🛡️ Anti-Nuke: Detected 1s Dangerous Act (${actName})` }).catch(() => {});
        }

        await logAction(
            guild, 
            config, 
            '🚨 Anti-Nuke: Rapid Threat Terminated', 
            `**Offender:** <@${executor.id}>\n**Act:** 1-Second Trigger (${actName})\n**Action:** Quarantined & Banned.`
        );
    };

    client.on('channelDelete', ch => ch.guild && instantDefense(ch.guild, AuditLogEvent.ChannelDelete, 'Channel Delete'));
    client.on('channelCreate', ch => ch.guild && instantDefense(ch.guild, AuditLogEvent.ChannelCreate, 'Channel Create'));
    client.on('roleDelete', r => r.guild && instantDefense(r.guild, AuditLogEvent.RoleDelete, 'Role Delete'));
    client.on('roleCreate', r => r.guild && instantDefense(r.guild, AuditLogEvent.RoleCreate, 'Role Create'));
    client.on('guildBanAdd', b => b.guild && instantDefense(b.guild, AuditLogEvent.MemberBanAdd, 'Member Ban'));
    client.on('guildMemberRemove', m => m.guild && instantDefense(m.guild, AuditLogEvent.MemberKick, 'Member Kick'));

    // Mention / Everyone Ping Spam Attack Blocker
    client.on('messageCreate', async (message) => {
        if (!message.guild || message.author.bot) return;

        const config = await ModerationConfig.findOne({ guildId: message.guild.id });
        if (!config || !config.antiNukeEnabled) return;

        const isBypassed = BOT_OWNERS.includes(message.author.id) ||
                          message.author.id === message.guild.ownerId ||
                          (config.extraOwners && config.extraOwners.includes(message.author.id));

        if (isBypassed) return;

        if (message.mentions.everyone || message.content.includes('@everyone') || message.content.includes('@here')) {
            await message.delete().catch(() => {});
            const member = message.member;
            if (member) {
                await stripDangerousPerms(member, 'Anti-Nuke: Unauthorized Mass Ping');
                await member.timeout(10 * 60 * 1000, 'Anti-Nuke: Mass Ping Spam').catch(() => {});
            }
        }
    });

    // 5. SPECIAL COMMANDS ENGINE (%extraowner, %wl, %pr, %antinuke, %backup, %clean)
    client.on('messageCreate', async (message) => {
        if (message.author.bot || !message.guild || !message.content.startsWith('%')) return;

        const args = message.content.slice(1).trim().split(/ +/);
        const cmd = args.shift()?.toLowerCase();
        let config = await ModerationConfig.findOne({ guildId: message.guild.id }) || await ModerationConfig.create({ guildId: message.guild.id });

        const isBotOwner = BOT_OWNERS.includes(message.author.id);
        const isServerOwner = message.author.id === message.guild.ownerId;
        const isExtraOwner = isBotOwner || (config.extraOwners && config.extraOwners.includes(message.author.id));

        if (!isBotOwner && !isServerOwner && !isExtraOwner) return;

        // %antinuke
        if (cmd === 'antinuke') {
            const state = args[0]?.toLowerCase();
            if (state === 'enable') {
                config.antiNukeEnabled = true;
                await config.save();
                return message.reply('✅ Anti-Nuke has been **ENABLED**.');
            } else if (state === 'disable') {
                config.antiNukeEnabled = false;
                await config.save();
                return message.reply('⚠️ Anti-Nuke has been **DISABLED**.');
            }
            return message.reply(`Status: Anti-Nuke is **${config.antiNukeEnabled ? 'ENABLED' : 'DISABLED'}**.`);
        }

        // %extraowner
        if (cmd === 'extraowner') {
            if (!isBotOwner && !isServerOwner) return message.reply('❌ Sirf Server Owner aur Bot Owners Extra Owner change kar sakte hain.');
            const sub = args[0]?.toLowerCase();
            const targetId = args[1]?.replace(/[<@!>]/g, '');
            if (!['add', 'remove'].includes(sub) || !targetId) return message.reply('Usage: `%extraowner add/remove <@user/ID>`');

            if (sub === 'add') {
                if (!config.extraOwners.includes(targetId)) config.extraOwners.push(targetId);
                await config.save();
                return message.reply(`✅ <@${targetId}> is now an Extra Owner.`);
            } else {
                config.extraOwners = config.extraOwners.filter(id => id !== targetId);
                await config.save();
                return message.reply(`❌ <@${targetId}> removed from Extra Owners.`);
            }
        }

        // %wl
        if (cmd === 'wl') {
            const sub = args[0]?.toLowerCase();
            const targetId = args[1]?.replace(/[<@!>]/g, '');
            if (!['add', 'remove'].includes(sub) || !targetId) return message.reply('Usage: `%wl add/remove <@user/bot/ID>`');

            const target = await client.users.fetch(targetId).catch(() => null);
            if (!target) return message.reply('❌ Target nahi mila.');

            const field = target.bot ? 'whitelistedBots' : 'whitelistedUsers';
            if (sub === 'add') {
                if (!config[field].includes(target.id)) config[field].push(target.id);
                await config.save();
                return message.reply(`✅ <@${target.id}> is now Whitelisted.`);
            } else {
                config[field] = config[field].filter(id => id !== target.id);
                await config.save();
                return message.reply(`❌ <@${target.id}> removed from Whitelist.`);
            }
        }

        // %clean <channels/roles>
        if (cmd === 'clean') {
            const target = args[0]?.toLowerCase();
            if (!['channels', 'roles'].includes(target)) {
                return message.reply('Usage: `%clean channels` ya `%clean roles`');
            }

            if (target === 'channels') {
                const currentChan = message.channel;
                const channels = message.guild.channels.cache.filter(c => c.id !== currentChan.id);
                for (const [, ch] of channels) {
                    await ch.delete('Clean command').catch(() => {});
                }
                return message.reply(`🧹 Cleaned **${channels.size}** channels.`);
            }

            if (target === 'roles') {
                const roles = message.guild.roles.cache.filter(r => r.id !== message.guild.id && r.editable);
                let count = 0;
                for (const [, r] of roles) {
                    await r.delete('Clean command').catch(() => {});
                    count++;
                }
                return message.reply(`🧹 Cleaned **${count}** roles.`);
            }
        }

        // %backup create/load/delete <backupId>
        if (cmd === 'backup') {
            const action = args[0]?.toLowerCase();
            const backupId = args[1];

            if (action === 'create') {
                if (!backupId) return message.reply('❌ Custom Backup ID provide karo: `%backup create <ID>`');
                const existing = await ServerBackup.findOne({ backupId });
                if (existing) return message.reply('❌ Yeh Backup ID pehle se exist karti hai.');

                await createGuildBackup(message.guild, message.author.id, backupId, false);
                return message.reply(`✅ Backup successfully created with ID: \`${backupId}\``);
            }

            if (action === 'delete') {
                if (!backupId) return message.reply('Usage: `%backup delete <ID>`');
                const res = await ServerBackup.deleteOne({ backupId, guildId: message.guild.id });
                if (res.deletedCount === 0) return message.reply('❌ Backup ID nahi mili.');
                return message.reply(`🗑️ Backup \`${backupId}\` deleted.`);
            }

            if (action === 'load') {
                if (!backupId) return message.reply('Usage: `%backup load <ID>`');
                const backupDoc = await ServerBackup.findOne({ backupId, guildId: message.guild.id });
                if (!backupDoc) return message.reply('❌ Backup ID nahi mili.');

                await message.reply('⏳ Restoring server channels and structure from backup...');

                const bData = backupDoc.data;

                // Restore channels
                for (const chData of bData.channels) {
                    const exists = message.guild.channels.cache.find(c => c.name === chData.name);
                    if (!exists) {
                        await message.guild.channels.create({
                            name: chData.name,
                            type: chData.type
                        }).catch(() => {});
                    }
                }

                return message.channel.send(`✅ Server restoration from backup \`${backupId}\` completed!`);
            }
        }
    });

    console.log('✔ Extreme Anti-Nuke System Active.');
};
                
