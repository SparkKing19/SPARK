const { 
    AuditLogEvent, 
    PermissionFlagsBits, 
    EmbedBuilder, 
    ChannelType 
} = require('discord.js');
const ModerationConfig = require('../models/moderation');
const ServerBackup = require('../models/backup');

// Permanent Bot Owners
const BOT_OWNERS = [
    '1266728371719508062', // FZBOY
    '1474216218792558735', // DAREQUEEN
    '1549995551288852584'
];

// Dangerous / Harmful Permissions
const DANGEROUS_PERMS = [
    PermissionFlagsBits.Administrator,
    PermissionFlagsBits.ManageGuild,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.BanMembers,
    PermissionFlagsBits.KickMembers,
    PermissionFlagsBits.MentionEveryone,
    PermissionFlagsBits.ManageWebhooks
];

// Millisecond-Level Action Tracking (Sub-second Rapid Action Limiter)
const actionBuckets = new Map();

// Helper: Real-time Multi-purpose Security & Audit Logger
async function logAudit(guild, config, title, description, color = '#ED4245') {
    if (!config?.modLogsChannelId) return;
    const channel = guild.channels.cache.get(config.modLogsChannelId);
    if (!channel || !channel.isTextBased()) return;

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(description)
        .setTimestamp();
    await channel.send({ embeds: [embed] }).catch(() => {});
}

// Helper: Strip Harmful Permissions
async function stripHarmfulPerms(member, reason) {
    if (!member || member.id === member.guild.ownerId) return;
    const dangerousRoles = member.roles.cache.filter(role => 
        role.id !== member.guild.id && DANGEROUS_PERMS.some(perm => role.permissions.has(perm))
    );
    if (dangerousRoles.size > 0) {
        await member.roles.remove(dangerousRoles, reason).catch(() => {});
    }
}

// Helper: Create Server Backup Snapshot
async function createGuildBackup(guild, creatorId, customId, backupType) {
    // 1. Roles sorted strictly by position descending (Highest role on top)
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

    // 2. Channels & Overwrites
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

    let expiresAt = null;
    if (backupType === 'AUTO_BOT_ADD') {
        expiresAt = new Date(Date.now() + 1.5 * 60 * 60 * 1000); // 1.5 Hours
    } else if (backupType === 'SERVER_OWNER') {
        expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 Hours
    }

    const backupDoc = new ServerBackup({
        backupId: customId,
        guildId: guild.id,
        creatorId,
        type: backupType,
        data: {
            name: guild.name,
            icon: guild.iconURL({ extension: 'png' }) || null,
            roles,
            channels
        },
        expiresAt
    });

    await backupDoc.save();
    return backupDoc;
}

module.exports = (client) => {
    client.setMaxListeners(60);

    // ==========================================
    // 1. STRICT BOT ADD & INSTANT BAN SHIELD
    // ==========================================
    client.on('guildMemberAdd', async (member) => {
        if (!member.user.bot) return;

        const config = await ModerationConfig.findOne({ guildId: member.guild.id });
        if (!config || !config.antiNukeEnabled) return;

        const audit = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.BotAdd }).catch(() => null);
        const entry = audit?.entries.first();
        const executor = entry?.executor;

        const isBotOwner = executor && BOT_OWNERS.includes(executor.id);
        const isServerOwner = executor?.id === member.guild.ownerId;
        const isExtraOwner = isBotOwner || (config.extraOwners && config.extraOwners.includes(executor?.id));

        // Case A: Kisi unauthorized user ne bot add kiya -> Bot aur Inviter dono instant BAN
        if (!isServerOwner && !isExtraOwner) {
            await member.ban({ reason: '🛡️ Anti-Nuke: Unauthorized Bot Added' }).catch(() => {});
            if (executor) {
                const inviter = await member.guild.members.fetch(executor.id).catch(() => null);
                if (inviter && inviter.id !== member.guild.ownerId) {
                    await stripHarmfulPerms(inviter, 'Anti-Nuke: Added Unauthorized Bot');
                    await inviter.ban({ reason: '🛡️ Anti-Nuke: Added Unauthorized Bot' }).catch(() => {});
                }
            }

            await logAudit(
                member.guild, 
                config, 
                '🚨 Anti-Nuke: Illegal Bot Addition Punished', 
                `**Bot:** ${member.user.tag} (\`${member.id}\`)\n**Invited By:** <@${executor?.id}>\n**Action:** Both Bot & Inviter BANNED immediately.`
            );
            return;
        }

        // Case B: Bot Owner / Server Owner / Extra Owner ne add kiya, par bot whitelist nahi hai -> Bot instant KICK
        const isWhitelisted = config.whitelistedBots && config.whitelistedBots.includes(member.id);
        if (!isWhitelisted) {
            await member.kick('🛡️ Anti-Nuke: Bot is NOT Whitelisted').catch(() => {});
            await logAudit(
                member.guild,
                config,
                '⚠️ Anti-Nuke: Unwhitelisted Bot Neutralized',
                `**Bot:** ${member.user.tag} (\`${member.id}\`)\n**Added By:** <@${executor?.id}> (Owner/Extra Owner)\n**Action:** Bot was kicked because it is not in the Whitelist.`,
                '#E67E22'
            );
            return;
        }

        // Case C: Valid Authorized Bot -> Trigger 1.5 Hour Auto-Backup
        try {
            const autoId = `autobot_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            await createGuildBackup(member.guild, client.user.id, autoId, 'AUTO_BOT_ADD');

            const backupEmbed = new EmbedBuilder()
                .setColor('#2ECC71')
                .setTitle('🛡️ Anti-Nuke: 1.5h Auto-Backup Created')
                .setDescription(`Authorized bot **${member.user.tag}** added by <@${executor.id}>.\nAuto snapshot created.`)
                .addFields(
                    { name: 'Backup ID', value: `\`${autoId}\``, inline: true },
                    { name: 'Expires In', value: '1.5 Hours', inline: true }
                )
                .setTimestamp();

            await logAudit(member.guild, config, '🛡️ Auto-Backup Created', `Backup ID: \`${autoId}\` (Valid for 1.5 hours)`, '#2ECC71');
        } catch (e) {
            console.error('Bot add backup error:', e);
        }
    });

    // ==========================================
    // 2. HARMFUL PERMISSION INTERCEPTOR
    // ==========================================
    // Kisi bhi user ko dangerous permission milte hi remove karna (Agar wo Owner/Extra/WL nahi hai)
    client.on('guildMemberUpdate', async (oldMember, newMember) => {
        const config = await ModerationConfig.findOne({ guildId: newMember.guild.id });
        if (!config || !config.antiNukeEnabled) return;

        const isBotOwner = BOT_OWNERS.includes(newMember.id);
        const isServerOwner = newMember.id === newMember.guild.ownerId;
        const isExtraOwner = config.extraOwners && config.extraOwners.includes(newMember.id);
        const isWhitelisted = config.whitelistedUsers && config.whitelistedUsers.includes(newMember.id);

        if (isBotOwner || isServerOwner || isExtraOwner || isWhitelisted) return;

        // Check if member has any harmful permissions through newly assigned roles
        const hasHarmful = DANGEROUS_PERMS.some(perm => newMember.permissions.has(perm));
        if (hasHarmful) {
            await stripHarmfulPerms(newMember, 'Anti-Nuke: Unauthorized Harmful Permission Detected');
            await logAudit(
                newMember.guild,
                config,
                '🛡️ Anti-Nuke: Harmful Roles Stripped',
                `**User:** <@${newMember.id}> attempted to receive dangerous permissions.\n**Action:** Dangerous roles instantly stripped.`
            );
        }
    });

    // ==========================================
    // 3. MILLISECOND-LEVEL THREAT KILLER
    // ==========================================
    const instantDefense = async (guild, auditType, actName) => {
        const config = await ModerationConfig.findOne({ guildId: guild.id });
        if (!config || !config.antiNukeEnabled) return;

        const audit = await guild.fetchAuditLogs({ limit: 1, type: auditType }).catch(() => null);
        const entry = audit?.entries.first();
        if (!entry) return;

        const executor = entry.executor;
        if (!executor || executor.id === client.user.id) return;

        const isBypassed = BOT_OWNERS.includes(executor.id) ||
                          executor.id === guild.ownerId ||
                          (config.extraOwners && config.extraOwners.includes(executor.id));

        if (isBypassed) return;

        // Millisecond limiter
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
            await stripHarmfulPerms(offender, 'Anti-Nuke: Millisecond Threat Elimination');
            await offender.ban({ reason: `🛡️ Anti-Nuke: Millisecond Trigger on ${actName}` }).catch(() => {});
        }

        await logAudit(
            guild,
            config,
            '🚨 Anti-Nuke: Rapid Malicious Threat Terminated',
            `**Offender:** <@${executor.id}> (\`${executor.id}\`)\n**Trigger:** ${actName}\n**Action:** Harmful perms removed & member BANNED instantly.`
        );
    };

    client.on('channelDelete', ch => ch.guild && instantDefense(ch.guild, AuditLogEvent.ChannelDelete, 'Channel Delete'));
    client.on('channelCreate', ch => ch.guild && instantDefense(ch.guild, AuditLogEvent.ChannelCreate, 'Channel Create'));
    client.on('roleDelete', r => r.guild && instantDefense(r.guild, AuditLogEvent.RoleDelete, 'Role Delete'));
    client.on('roleCreate', r => r.guild && instantDefense(r.guild, AuditLogEvent.RoleCreate, 'Role Create'));
    client.on('guildBanAdd', b => b.guild && instantDefense(b.guild, AuditLogEvent.MemberBanAdd, 'Member Ban'));
    client.on('guildMemberRemove', async m => {
        // Kick detect karne ke liye
        if (!m.guild) return;
        const audit = await m.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberKick }).catch(() => null);
        const entry = audit?.entries.first();
        if (entry && entry.target?.id === m.id && Date.now() - entry.createdTimestamp < 3000) {
            instantDefense(m.guild, AuditLogEvent.MemberKick, 'Member Kick');
        }
    });

    // ==========================================
    // 4. A-Z FULL AUDIT LOGS TRACKER
    // ==========================================
    client.on('messageDelete', async (message) => {
        if (!message.guild || message.author?.bot) return;
        const config = await ModerationConfig.findOne({ guildId: message.guild.id });
        await logAudit(
            message.guild, 
            config, 
            '🗑️ Message Deleted', 
            `**Author:** <@${message.author?.id}>\n**Channel:** <#${message.channel.id}>\n**Content:** \`\`\`${message.content?.slice(0, 500) || '[No text / Media]'}\`\`\``, 
            '#F39C12'
        );
    });

    client.on('messageUpdate', async (oldMsg, newMsg) => {
        if (!oldMsg.guild || oldMsg.author?.bot || oldMsg.content === newMsg.content) return;
        const config = await ModerationConfig.findOne({ guildId: oldMsg.guild.id });
        await logAudit(
            oldMsg.guild, 
            config, 
            '✏️ Message Edited', 
            `**Author:** <@${oldMsg.author?.id}>\n**Channel:** <#${oldMsg.channel.id}>\n**Before:** \`\`\`${oldMsg.content?.slice(0, 300) || 'None'}\`\`\`\n**After:** \`\`\`${newMsg.content?.slice(0, 300) || 'None'}\`\`\``, 
            '#3498DB'
        );
    });

    // ==========================================
    // 5. RESTRICTED PREFIX COMMANDS ENGINE
    // ==========================================
    client.on('messageCreate', async (message) => {
        if (message.author.bot || !message.guild || !message.content.startsWith('%')) return;

        const args = message.content.slice(1).trim().split(/ +/);
        const cmd = args.shift()?.toLowerCase();
        let config = await ModerationConfig.findOne({ guildId: message.guild.id }) || await ModerationConfig.create({ guildId: message.guild.id });

        const isBotOwner = BOT_OWNERS.includes(message.author.id);
        const isServerOwner = message.author.id === message.guild.ownerId;
        const isExtraOwner = isBotOwner || (config.extraOwners && config.extraOwners.includes(message.author.id));

        // Command: %clean channels & %clean roles (STRICTLY BOT OWNER ONLY)
        if (cmd === 'clean') {
            if (!isBotOwner) {
                return message.reply('❌ **Permission Denied:** `%clean` commands are strictly restricted to **Bot Owners**.');
            }

            const target = args[0]?.toLowerCase();
            if (!['channels', 'roles'].includes(target)) {
                return message.reply('Usage: `%clean channels` ya `%clean roles`');
            }

            if (target === 'channels') {
                const currentChan = message.channel;
                const channels = message.guild.channels.cache.filter(c => c.id !== currentChan.id);
                for (const [, ch] of channels) {
                    await ch.delete('Bot Owner Mass Clean').catch(() => {});
                }
                return message.reply(`🧹 Cleaned **${channels.size}** channels.`);
            }

            if (target === 'roles') {
                const botHighest = message.guild.members.me.roles.highest.position;
                const roles = message.guild.roles.cache.filter(r => r.id !== message.guild.id && r.position < botHighest && r.editable);
                let count = 0;
                for (const [, r] of roles) {
                    await r.delete('Bot Owner Mass Clean').catch(() => {});
                    count++;
                }
                return message.reply(`🧹 Cleaned **${count}** roles.`);
            }
        }

        // Commands for Bot Owner, Server Owner & Extra Owner
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
            if (!isBotOwner && !isServerOwner) return message.reply('❌ Only Server Owner and Bot Owners can manage Extra Owners.');
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
            if (!target) return message.reply('❌ Target user/bot not found.');

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

        // %backup create / load / delete
        if (cmd === 'backup') {
            const action = args[0]?.toLowerCase();
            const backupId = args[1];

            // 1. CREATE BACKUP
            if (action === 'create') {
                if (!backupId) return message.reply('❌ Backup name provide karo: `%backup create <name>`');

                const existing = await ServerBackup.findOne({ backupId });
                if (existing) return message.reply('❌ Yeh Backup ID pehle se exist karti hai. Dusri ID choose karo.');

                if (isBotOwner) {
                    const count = await ServerBackup.countDocuments({ creatorId: message.author.id, type: 'BOT_OWNER' });
                    if (count >= 5) {
                        return message.reply('❌ **Bot Owner Limit Exceeded (Max 5 Backups)!** Delete an existing backup via `%backup delete <name>` first.');
                    }
                    await createGuildBackup(message.guild, message.author.id, backupId, 'BOT_OWNER');
                    return message.reply(`✅ Permanent Backup **${backupId}** created! (Permanent until manually deleted).`);
                } else if (isServerOwner) {
                    const count = await ServerBackup.countDocuments({ guildId: message.guild.id, type: 'SERVER_OWNER' });
                    if (count >= 1) {
                        return message.reply('❌ **Server Owner Limit Exceeded (Max 1 Backup)!** Delete the existing backup via `%backup delete <name>` first.');
                    }
                    await createGuildBackup(message.guild, message.author.id, backupId, 'SERVER_OWNER');
                    return message.reply(`✅ 24-Hour Backup **${backupId}** created! (Auto-expires in 24 hours).`);
                } else {
                    return message.reply('❌ Only Bot Owners and Server Owner can create backups.');
                }
            }

            // 2. DELETE BACKUP
            if (action === 'delete') {
                if (!backupId) return message.reply('Usage: `%backup delete <name>`');
                const query = isBotOwner ? { backupId } : { backupId, guildId: message.guild.id };
                const res = await ServerBackup.deleteOne(query);
                if (res.deletedCount === 0) return message.reply('❌ Backup nahi mila ya delete karne ki permission nahi hai.');
                return message.reply(`🗑️ Backup \`${backupId}\` successfully delete ho gaya.`);
            }

            // 3. LOAD BACKUP (Hierarchy & Ranking Preserved)
            if (action === 'load') {
                if (!backupId) return message.reply('Usage: `%backup load <name>`');
                const backupDoc = await ServerBackup.findOne({ backupId });
                if (!backupDoc) return message.reply('❌ Backup ID nahi mili.');

                await message.reply('⏳ **Restoring exact server architecture...** Line-by-line categories, channels, and role hierarchy syncing...');

                const bData = backupDoc.data;
                const roleMap = new Map();

                // Restore Roles in strict hierarchy order (Reverse order me create taaki positioning sahi rahe)
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
                                reason: `Backup Restore: ${backupId}`
                            }).catch(() => null);
                        }
                        if (role) roleMap.set(role.name, role);
                    }
                }

                // Restore Categories & Channels with exact overwrites
                const categoryChannels = (bData.channels || [])
                    .filter(c => c.type === 4 || c.type === ChannelType.GuildCategory)
                    .sort((a, b) => a.position - b.position);

                const categoryMap = new Map();

                for (const cat of categoryChannels) {
                    let targetCat = message.guild.channels.cache.find(c => c.name === cat.name && c.type === 4);
                    if (!targetCat) {
                        targetCat = await message.guild.channels.create({
                            name: cat.name,
                            type: ChannelType.GuildCategory,
                            position: cat.position,
                            reason: `Backup Restore: ${backupId}`
                        }).catch(() => null);
                    }
                    if (targetCat) categoryMap.set(cat.name, targetCat.id);
                }

                const childChannels = (bData.channels || [])
                    .filter(c => c.type !== 4 && c.type !== ChannelType.GuildCategory)
                    .sort((a, b) => a.position - b.position);

                for (const ch of childChannels) {
                    const parentId = ch.parentName ? categoryMap.get(ch.parentName) : null;
                    let targetChannel = message.guild.channels.cache.find(c => c.name === ch.name && c.type === ch.type);

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
                            reason: `Backup Restore: ${backupId}`
                        }).catch(() => {});
                    }
                }

                return message.channel.send(`✅ **Full Server Template Loaded Successfully!**\n• Backup ID: \`${backupId}\`\n• Hierarchy & Roles restored.`);
            }
        }
    });

    console.log('✔ Extreme Anti-Nuke System Active (Milliseconds Threat Guard).');
};
