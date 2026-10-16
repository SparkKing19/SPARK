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
const BOT_OWNERS = ['1266728371719508062', '1474216218792558735', '1549995551288852584'];

const DANGEROUS_PERMS = [
    PermissionFlagsBits.Administrator,
    PermissionFlagsBits.ManageGuild,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.BanMembers,
    PermissionFlagsBits.KickMembers,
    PermissionFlagsBits.MentionEveryone
];

const actionBuckets = new Map();

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

async function stripDangerousPerms(member, reason) {
    if (!member || member.id === member.guild.ownerId) return;
    const dangerousRoles = member.roles.cache.filter(role => 
        DANGEROUS_PERMS.some(perm => role.permissions.has(perm))
    );
    if (dangerousRoles.size > 0) {
        await member.roles.remove(dangerousRoles, reason).catch(() => {});
    }
}

// Backup creator helper (Preserves types, positions & dynamic overwrites)
async function createGuildBackup(guild, creatorId, customId = null, isAuto = false) {
    const backupId = customId || `auto_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // 1. Roles sorted by position
    const roles = guild.roles.cache
        .filter(r => r.id !== guild.id)
        .sort((a, b) => b.position - a.position)
        .map(r => ({
            name: r.name,
            color: r.color,
            hoist: r.hoist,
            position: r.position,
            permissions: r.permissions ? r.permissions.bitfield.toString() : '0',
            mentionable: r.mentionable
        }));

    // 2. Channels sorted by rawPosition
    const channels = guild.channels.cache
        .filter(c => !c.isThread?.())
        .sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0))
        .map(c => {
            const overwrites = [];
            if (c.permissionOverwrites?.cache) {
                c.permissionOverwrites.cache.forEach(p => {
                    let targetName = null;
                    let isEveryone = (p.id === guild.id);

                    if (!isEveryone) {
                        const targetRole = guild.roles.cache.get(p.id);
                        if (targetRole) targetName = targetRole.name;
                    }

                    overwrites.push({
                        isEveryone,
                        roleName: targetName,
                        type: p.type,
                        allow: p.allow ? p.allow.bitfield.toString() : '0',
                        deny: p.deny ? p.deny.bitfield.toString() : '0'
                    });
                });
            }

            return {
                name: c.name,
                type: c.type,
                topic: c.topic || null,
                nsfw: Boolean(c.nsfw),
                rateLimitPerUser: c.rateLimitPerUser || 0,
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

    if (isAuto) {
        setTimeout(async () => {
            await ServerBackup.deleteOne({ backupId }).catch(() => {});
        }, 10 * 60 * 1000);
    }

    return backupId;
}

module.exports = (client) => {
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

        // Rule 1: Unauthorized bot adder ban
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

        // Rule 2: Unwhitelisted bot neutralized
        const isWhitelisted = config.whitelistedBots && config.whitelistedBots.includes(member.id);
        if (!isWhitelisted) {
            await stripDangerousPerms(member, 'Anti-Nuke: Unwhitelisted Bot Neutralized');
        }

        // Rule 4: Instant Full Server Auto-Backup & DM Notify
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

            const sOwner = await client.users.fetch(member.guild.ownerId).catch(() => null);
            if (sOwner) await sOwner.send({ embeds: [backupEmbed] }).catch(() => {});

            for (const bOwnerId of BOT_OWNERS) {
                const bOwner = await client.users.fetch(bOwnerId).catch(() => null);
                if (bOwner) await bOwner.send({ embeds: [backupEmbed] }).catch(() => {});
            }

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

        const isBypassed = BOT_OWNERS.includes(executor.id) ||
                          executor.id === guild.ownerId ||
                          (config.extraOwners && config.extraOwners.includes(executor.id));

        if (isBypassed) return;

        const now = Date.now();
        const tracker = actionBuckets.get(executor.id) || { count: 0, lastTime: now };

        if (now - tracker.lastTime < 1000) {
            tracker.count += 1;
        } else {
            tracker.count = 1;
        }
        tracker.lastTime = now;
        actionBuckets.set(executor.id, tracker);

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

    // Everyone Ping Spam Blocker
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

    // 5. PREFIX COMMANDS ENGINE
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

            // 1. CREATE
            if (action === 'create') {
                if (!backupId) return message.reply('❌ Custom Backup ID provide karo: `%backup create <backupId>`');
                
                const existing = await ServerBackup.findOne({ backupId });
                if (existing) return message.reply('❌ Yeh Backup ID pehle se exist karti hai. Koi doosri ID choose karo.');

                if (isBotOwner) {
                    const ownerBackups = await ServerBackup.find({ creatorId: message.author.id, isAutoBackup: false });
                    if (ownerBackups.length >= 3) {
                        const idsList = ownerBackups.map(b => `• \`${b.backupId}\``).join('\n');
                        return message.reply(`❌ **Bot Owner Backup Limit Exceeded (Max 3)!**\nNaya backup create karne se pehle inme se koi ek delete karo:\n${idsList}\n\n*Command:* \`%backup delete <backupId>\``);
                    }
                } else {
                    const serverBackups = await ServerBackup.find({ guildId: message.guild.id, isAutoBackup: false });
                    if (serverBackups.length >= 1) {
                        const existingId = serverBackups[0].backupId;
                        return message.reply(`❌ **Server Backup Limit Exceeded (Max 1)!**\nIs server ke paas pehle se ek permanent backup mojood hai: \`${existingId}\`\nNaya create karne ke liye pehle isko delete karo: \`%backup delete ${existingId}\``);
                    }
                }

                await createGuildBackup(message.guild, message.author.id, backupId, false);
                return message.reply(`✅ Backup successfully created with ID: \`${backupId}\``);
            }

            // 2. DELETE
            if (action === 'delete') {
                if (!backupId) return message.reply('Usage: `%backup delete <backupId>`');

                let query = { backupId, isAutoBackup: false };
                if (!isBotOwner) {
                    query.guildId = message.guild.id;
                }

                const res = await ServerBackup.deleteOne(query);
                if (res.deletedCount === 0) return message.reply('❌ Backup ID nahi mili ya aapke paas ise delete karne ki permission nahi hai.');
                return message.reply(`🗑️ Backup \`${backupId}\` successfully delete ho gaya.`);
            }

            // 3. LOAD
            if (action === 'load') {
                if (!backupId) return message.reply('Usage: `%backup load <backupId>`');

                const backupDoc = await ServerBackup.findOne({ backupId });
                if (!backupDoc) return message.reply('❌ Backup ID nahi mili.');

                await message.reply('⏳ **Restoring exact server architecture...** Line-by-line categories, channels aur permissions sync ho rahe hain...');

                const bData = backupDoc.data;
                const roleMap = new Map();

                // A. Restore Roles
                if (bData.roles && Array.isArray(bData.roles)) {
                    for (const rData of bData.roles.slice().reverse()) {
                        let role = message.guild.roles.cache.find(r => r.name === rData.name);
                        if (!role) {
                            role = await message.guild.roles.create({
                                name: rData.name,
                                color: rData.color,
                                hoist: rData.hoist,
                                permissions: BigInt(rData.permissions || '0'),
                                mentionable: rData.mentionable,
                                reason: `Backup Template: ${backupId}`
                            }).catch(() => null);
                        }
                        if (role) roleMap.set(role.name, role);
                    }
                }

                // B. Overwrites Helper
                const buildOverwrites = (overwritesList) => {
                    if (!overwritesList || !Array.isArray(overwritesList)) return [];
                    const result = [];

                    for (const ow of overwritesList) {
                        let targetId = null;

                        if (ow.isEveryone) {
                            targetId = message.guild.roles.everyone.id;
                        } else if (ow.roleName && roleMap.has(ow.roleName)) {
                            targetId = roleMap.get(ow.roleName).id;
                        } else if (ow.roleName) {
                            const found = message.guild.roles.cache.find(r => r.name === ow.roleName);
                            if (found) targetId = found.id;
                        }

                        if (targetId) {
                            result.push({
                                id: targetId,
                                allow: BigInt(ow.allow || '0'),
                                deny: BigInt(ow.deny || '0')
                            });
                        }
                    }
                    return result;
                };

                // C. Restore Categories in Order
                const categoryChannels = (bData.channels || [])
                    .filter(c => c.type === 4 || c.type === ChannelType.GuildCategory)
                    .sort((a, b) => a.position - b.position);

                const categoryMap = new Map();

                for (const cat of categoryChannels) {
                    let targetCat = message.guild.channels.cache.find(c => c.name === cat.name && c.type === 4);
                    const overwrites = buildOverwrites(cat.permissionOverwrites);

                    if (!targetCat) {
                        targetCat = await message.guild.channels.create({
                            name: cat.name,
                            type: ChannelType.GuildCategory,
                            position: cat.position,
                            permissionOverwrites: overwrites,
                            reason: `Backup Layout: ${backupId}`
                        }).catch(() => null);
                    } else if (overwrites.length > 0) {
                        await targetCat.permissionOverwrites.set(overwrites).catch(() => {});
                    }

                    if (targetCat) categoryMap.set(cat.name, targetCat.id);
                }

                // D. Restore Text, Announcement, Voice & Stage Channels in Order
                const childChannels = (bData.channels || [])
                    .filter(c => c.type !== 4 && c.type !== ChannelType.GuildCategory)
                    .sort((a, b) => a.position - b.position);

                for (const ch of childChannels) {
                    const parentId = ch.parentName ? categoryMap.get(ch.parentName) : null;
                    let targetChannel = message.guild.channels.cache.find(c => c.name === ch.name && c.type === ch.type);
                    const overwrites = buildOverwrites(ch.permissionOverwrites);

                    let resolvedType = ch.type;
                    if (resolvedType === 5 && !message.guild.features.includes('COMMUNITY')) {
                        resolvedType = ChannelType.GuildText;
                    }

                    if (!targetChannel) {
                        await message.guild.channels.create({
                            name: ch.name,
                            type: resolvedType,
                            topic: ch.topic || undefined,
                            nsfw: ch.nsfw || false,
                            rateLimitPerUser: ch.rateLimitPerUser || 0,
                            position: ch.position,
                            parent: parentId || undefined,
                            permissionOverwrites: overwrites,
                            reason: `Backup Layout: ${backupId}`
                        }).catch(() => {});
                    } else {
                        if (parentId && targetChannel.parentId !== parentId) {
                            await targetChannel.setParent(parentId, { lockPermissions: false }).catch(() => {});
                        }
                        if (overwrites.length > 0) {
                            await targetChannel.permissionOverwrites.set(overwrites).catch(() => {});
                        }
                    }
                }

                return message.channel.send(`✅ **Full Server Template Loaded Successfully!**\n• Backup ID: \`${backupId}\`\n• Categories, Channels, Order & Permissions properly synced.`);
            }
        }
    });

    console.log('✔ Extreme Anti-Nuke System Active.');
};
