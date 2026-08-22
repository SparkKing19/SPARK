const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const InviteConfig = require('../models/inviteConfig');
const InviteUser = require('../models/inviteUser');

// Guild invite cache
const guildInvitesCache = new Map();

module.exports = (client) => {
    // 1. Pre-cache all server invites
    client.once('ready', async () => {
        for (const guild of client.guilds.cache.values()) {
            try {
                const firstInvites = await guild.invites.fetch();
                guildInvitesCache.set(guild.id, new Map(firstInvites.map(inv => [inv.code, inv.uses])));
            } catch (err) {
                // Missing Manage Server permissions for invites
            }
        }
        console.log('✔ Invite tracker cache initialized.');
    });

    client.on('inviteCreate', (invite) => {
        const current = guildInvitesCache.get(invite.guild.id) || new Map();
        current.set(invite.code, invite.uses);
        guildInvitesCache.set(invite.guild.id, current);
    });

    client.on('inviteDelete', (invite) => {
        const current = guildInvitesCache.get(invite.guild.id);
        if (current) {
            current.delete(invite.code);
        }
    });

    // 2. Panel Setup Interactions
    client.on('interactionCreate', async (interaction) => {
        if (interaction.isButton() && interaction.customId === 'open_invite_modal') {
            const data = await InviteConfig.findOne({ guildId: interaction.guild.id }) || {};

            const modal = new ModalBuilder()
                .setCustomId('invite_config_modal')
                .setTitle('Invite System Setup');

            const channelInput = new TextInputBuilder()
                .setCustomId('invite_channels_input')
                .setLabel('Invite Channel ID || Logs Channel ID')
                .setPlaceholder('INVITE_CHANNEL_ID || LOGS_CHANNEL_ID')
                .setStyle(TextInputStyle.Short)
                .setValue(data.inviteChannelId && data.logsChannelId ? `${data.inviteChannelId} || ${data.logsChannelId}` : '')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(channelInput));
            await interaction.showModal(modal);
        }

        if (interaction.isModalSubmit() && interaction.customId === 'invite_config_modal') {
            const raw = interaction.fields.getTextInputValue('invite_channels_input');
            const [inviteChannelId, logsChannelId] = raw.split('||').map(s => s.trim());

            await InviteConfig.findOneAndUpdate(
                { guildId: interaction.guild.id },
                { inviteChannelId, logsChannelId },
                { upsert: true, new: true }
            );

            await interaction.reply({ content: '✅ Invite System successfully configured!', ephemeral: true });
        }
    });

    // 3. Member Join Tracker
    client.on('guildMemberAdd', async (member) => {
        const config = await InviteConfig.findOne({ guildId: member.guild.id });
        const cachedInvites = guildInvitesCache.get(member.guild.id) || new Map();
        let newInvites;

        try {
            newInvites = await member.guild.invites.fetch();
        } catch {
            return;
        }

        let usedInvite = newInvites.find(inv => {
            const prevUses = cachedInvites.get(inv.code) || 0;
            return inv.uses > prevUses;
        });

        // Update local cache
        guildInvitesCache.set(member.guild.id, new Map(newInvites.map(inv => [inv.code, inv.uses])));

        let inviter = usedInvite ? usedInvite.inviter : null;
        let isVanity = false;

        if (!usedInvite && member.guild.vanityURLCode) {
            isVanity = true;
        }

        let inviterData = null;
        let isRejoin = false;

        if (inviter) {
            inviterData = await InviteUser.findOne({ guildId: member.guild.id, userId: inviter.id });
            if (!inviterData) {
                inviterData = new InviteUser({ guildId: member.guild.id, userId: inviter.id });
            }

            const existingIndex = inviterData.invitedMembers.findIndex(m => m.memberId === member.id);
            if (existingIndex !== -1) {
                isRejoin = true;
                inviterData.rejoined += 1;
                inviterData.invitedMembers[existingIndex].status = 'rejoined';
            } else {
                inviterData.regular += 1;
                inviterData.invitedMembers.push({ memberId: member.id, status: 'joined' });
            }
            await inviterData.save();
        }

        // Send to Public Invites Channel (Clean Author Embed Style)
        if (config?.inviteChannelId) {
            const ch = member.guild.channels.cache.get(config.inviteChannelId);
            if (ch) {
                const joinEmbed = new EmbedBuilder()
                    .setColor('#2ECC71')
                    .setAuthor({
                        name: `${member.user.username} joined the server`,
                        iconURL: member.user.displayAvatarURL()
                    });

                await ch.send({ embeds: [joinEmbed] }).catch(() => {});
            }
        }

        // Send Detailed Information to Mod/Invite Logs Channel
        if (config?.logsChannelId) {
            const logCh = member.guild.channels.cache.get(config.logsChannelId);
            if (logCh) {
                const total = inviterData ? (inviterData.regular - inviterData.left) : 0;
                const logEmbed = new EmbedBuilder()
                    .setColor('#2ECC71')
                    .setTitle('📥 Member Joined - Invite Log')
                    .setThumbnail(member.user.displayAvatarURL())
                    .addFields(
                        { name: '👤 Member', value: `<@${member.id}> (${member.user.tag})`, inline: true },
                        { name: '🔗 Inviter', value: inviter ? `<@${inviter.id}> (${inviter.tag})` : (isVanity ? 'Vanity URL' : 'Unknown / Direct'), inline: true },
                        { name: '📊 Total Invites', value: `\`${total}\``, inline: true },
                        { name: '🎟️ Invite Code', value: usedInvite ? `\`${usedInvite.code}\`` : 'N/A', inline: true },
                        { name: '📌 Status', value: isRejoin ? '🔄 Rejoined' : '✨ New Join', inline: true },
                        { name: '⏰ Joined At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
                    )
                    .setTimestamp();

                await logCh.send({ embeds: [logEmbed] }).catch(() => {});
            }
        }
    });

    // 4. Member Leave Tracker
    client.on('guildMemberRemove', async (member) => {
        const config = await InviteConfig.findOne({ guildId: member.guild.id });

        const inviterData = await InviteUser.findOne({
            guildId: member.guild.id,
            'invitedMembers.memberId': member.id
        });

        let inviterUser = null;
        if (inviterData) {
            inviterData.left += 1;
            const target = inviterData.invitedMembers.find(m => m.memberId === member.id);
            if (target) target.status = 'left';
            await inviterData.save();

            inviterUser = await client.users.fetch(inviterData.userId).catch(() => null);
        }

        // Send to Public Invites Channel (Clean Author Embed Style)
        if (config?.inviteChannelId) {
            const ch = member.guild.channels.cache.get(config.inviteChannelId);
            if (ch) {
                const leaveEmbed = new EmbedBuilder()
                    .setColor('#ED4245')
                    .setAuthor({
                        name: `${member.user.username} left the server`,
                        iconURL: member.user.displayAvatarURL()
                    });

                await ch.send({ embeds: [leaveEmbed] }).catch(() => {});
            }
        }

        // Send Detailed Information to Mod/Invite Logs Channel
        if (config?.logsChannelId) {
            const logCh = member.guild.channels.cache.get(config.logsChannelId);
            if (logCh) {
                const total = inviterData ? (inviterData.regular - inviterData.left) : 0;
                const logEmbed = new EmbedBuilder()
                    .setColor('#ED4245')
                    .setTitle('📤 Member Left - Invite Log')
                    .setThumbnail(member.user.displayAvatarURL())
                    .addFields(
                        { name: '👤 Member', value: `<@${member.id}> (${member.user.tag})`, inline: true },
                        { name: '🔗 Invited By', value: inviterUser ? `<@${inviterUser.id}> (${inviterUser.tag})` : 'Unknown / Left earlier', inline: true },
                        { name: '📊 Inviter Net Total', value: `\`${total}\``, inline: true },
                        { name: '⏰ Left At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
                    )
                    .setTimestamp();

                await logCh.send({ embeds: [logEmbed] }).catch(() => {});
            }
        }
    });

    // 5. Prefix Commands: &i and &lb
    client.on('messageCreate', async (message) => {
        if (message.author.bot || !message.guild) return;

        const content = message.content.trim();

        // Command: &i or &i @user
        if (content.startsWith('&i')) {
            const targetUser = message.mentions.users.first() || message.author;
            const data = await InviteUser.findOne({ guildId: message.guild.id, userId: targetUser.id }) || {
                regular: 0,
                left: 0,
                rejoined: 0
            };

            const total = data.regular - data.left;

            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setAuthor({ name: `${targetUser.username}'s Invites`, iconURL: targetUser.displayAvatarURL() })
                .setDescription(`✨ **Total Current Invites:** \`${total}\``)
                .addFields(
                    { name: '📥 Joined (Regular)', value: `\`${data.regular}\``, inline: true },
                    { name: '📤 Left', value: `\`${data.left}\``, inline: true },
                    { name: '🔄 Rejoined', value: `\`${data.rejoined}\``, inline: true }
                )
                .setFooter({ text: 'Invite Tracker System' })
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        }

        // Command: &lb (Top 10 Leaderboard)
        if (content.toLowerCase() === '&lb' || content.toLowerCase() === '&leaderboard') {
            const allUsers = await InviteUser.find({ guildId: message.guild.id });
            if (!allUsers || allUsers.length === 0) {
                return message.reply('📊 No invite data found for this server yet.');
            }

            const sorted = allUsers
                .map(u => ({ userId: u.userId, total: u.regular - u.left, regular: u.regular, left: u.left }))
                .sort((a, b) => b.total - a.total)
                .slice(0, 10);

            const medals = ['🥇', '🥈', '🥉'];
            const desc = sorted.map((u, i) => {
                const medal = medals[i] || `**#${i + 1}.**`;
                return `${medal} <@${u.userId}> ➔ **${u.total}** invites (\`${u.regular}\` regular, \`${u.left}\` left)`;
            }).join('\n\n');

            const lbEmbed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle(`🏆 ${message.guild.name} - Invite Leaderboard`)
                .setDescription(desc)
                .setFooter({ text: 'Top 10 Server Inviters' })
                .setTimestamp();

            return message.reply({ embeds: [lbEmbed] });
        }
    });

    console.log('✔ Invite handler loaded.');
};
    
