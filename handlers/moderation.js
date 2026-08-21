const { 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder, 
    EmbedBuilder, 
    PermissionFlagsBits 
} = require('discord.js');
const ModerationConfig = require('../models/moderation');

// Cache to prevent duplicate messages (User ID -> { content, timestamp })
const lastMessages = new Map();

// Regex patterns
const LINK_REGEX = /(https?:\/\/[^\s]+)|(discord\.(gg|io|me|li)\/[^\s]+)|(discordapp\.com\/invite\/[^\s]+)/i;
const IP_REGEX = /\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b|(?:[a-zA-Z0-9-]+\.)+(?:com|net|org|io|me|xyz|gg|in|play|server)(?::\d+)?/i;

module.exports = (client) => {

    client.on('interactionCreate', async (interaction) => {
        // 1. Open Setup Modal
        if (interaction.isButton() && interaction.customId === 'open_mod_modal') {
            const data = await ModerationConfig.findOne({ guildId: interaction.guild.id }) || {};

            const modal = new ModalBuilder()
                .setCustomId('mod_config_modal')
                .setTitle('Moderation & Auto-Mod Setup');

            const staffInput = new TextInputBuilder()
                .setCustomId('mod_staff_roles')
                .setLabel('Staff Role IDs (Sep by comma)')
                .setPlaceholder('123456789, 987654321')
                .setStyle(TextInputStyle.Short)
                .setValue(data.staffRoleIds?.join(', ') || '')
                .setRequired(true);

            const linkInput = new TextInputBuilder()
                .setCustomId('mod_link_roles')
                .setLabel('Allow Links Role IDs (Sep by comma)')
                .setPlaceholder('Role IDs allowed to post URLs/invites')
                .setStyle(TextInputStyle.Short)
                .setValue(data.linkAllowRoleIds?.join(', ') || '')
                .setRequired(false);

            const ipInput = new TextInputBuilder()
                .setCustomId('mod_ip_roles')
                .setLabel('Allow IP/Advertise Role IDs')
                .setPlaceholder('Role IDs allowed to share IP addresses')
                .setStyle(TextInputStyle.Short)
                .setValue(data.ipAllowRoleIds?.join(', ') || '')
                .setRequired(false);

            const channelInput = new TextInputBuilder()
                .setCustomId('mod_channels')
                .setLabel('Ignored / Restricted Channel IDs')
                .setPlaceholder('Channel IDs to apply strict auto-mod denial')
                .setStyle(TextInputStyle.Short)
                .setValue(data.ignoredChannelIds?.join(', ') || '')
                .setRequired(false);

            const logsInput = new TextInputBuilder()
                .setCustomId('mod_logs_channel')
                .setLabel('Mod Logs Channel ID')
                .setPlaceholder('Channel ID for moderation logs')
                .setStyle(TextInputStyle.Short)
                .setValue(data.modLogsChannelId || '')
                .setRequired(false);

            modal.addComponents(
                new ActionRowBuilder().addComponents(staffInput),
                new ActionRowBuilder().addComponents(linkInput),
                new ActionRowBuilder().addComponents(ipInput),
                new ActionRowBuilder().addComponents(channelInput),
                new ActionRowBuilder().addComponents(logsInput)
            );

            await interaction.showModal(modal);
        }

        // 2. Save Setup Modal Configuration
        if (interaction.isModalSubmit() && interaction.customId === 'mod_config_modal') {
            await interaction.deferReply({ ephemeral: true });

            const staffRoleIds = interaction.fields.getTextInputValue('mod_staff_roles').split(',').map(s => s.trim()).filter(Boolean);
            const linkAllowRoleIds = interaction.fields.getTextInputValue('mod_link_roles').split(',').map(s => s.trim()).filter(Boolean);
            const ipAllowRoleIds = interaction.fields.getTextInputValue('mod_ip_roles').split(',').map(s => s.trim()).filter(Boolean);
            const ignoredChannelIds = interaction.fields.getTextInputValue('mod_channels').split(',').map(s => s.trim()).filter(Boolean);
            const modLogsChannelId = interaction.fields.getTextInputValue('mod_logs_channel').trim() || null;

            await ModerationConfig.findOneAndUpdate(
                { guildId: interaction.guild.id },
                { staffRoleIds, linkAllowRoleIds, ipAllowRoleIds, ignoredChannelIds, modLogsChannelId },
                { upsert: true, new: true }
            );

            await interaction.editReply({ content: '✅ Moderation & Auto-Mod rules have been successfully configured!' });
        }
    });

    // 3. Auto-Mod Engine (Anti-Duplicate, Anti-Link, Anti-IP)
    client.on('messageCreate', async (message) => {
        if (message.author.bot || !message.guild) return;

        const config = await ModerationConfig.findOne({ guildId: message.guild.id });
        if (!config) return;

        const member = message.member;
        if (!member) return;

        const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
        const isStaff = config.staffRoleIds?.some(id => member.roles.cache.has(id));

        if (isAdmin || isStaff) return; // Staff & Admin bypass

        const content = message.content.trim().toLowerCase();
        let violation = null;

        // A. Anti-Duplicate Message Check (Within 10 seconds)
        const lastMsg = lastMessages.get(message.author.id);
        const now = Date.now();

        if (lastMsg && lastMsg.content === content && (now - lastMsg.time) < 10000 && content.length > 2) {
            violation = 'Repeated / Duplicate Message Spam';
        } else {
            lastMessages.set(message.author.id, { content, time: now });
        }

        // B. Anti-Link / Invite Check
        const canSendLinks = config.linkAllowRoleIds?.some(id => member.roles.cache.has(id));
        if (!violation && !canSendLinks && LINK_REGEX.test(message.content)) {
            violation = 'Unauthorized Link / Invite Shared';
        }

        // C. Anti-IP / Server Advertise Check
        const canSendIP = config.ipAllowRoleIds?.some(id => member.roles.cache.has(id));
        if (!violation && !canSendIP && IP_REGEX.test(message.content)) {
            violation = 'Unauthorized Server IP / Advertisement';
        }

        // If Violation Found -> Delete & Warn
        if (violation) {
            await message.delete().catch(() => {});

            const warnMsg = await message.channel.send(`⚠️ <@${message.author.id}>, your message was deleted: **${violation}**`);
            setTimeout(() => warnMsg.delete().catch(() => {}), 4000);

            // Log Violation
            if (config.modLogsChannelId) {
                const logsChannel = message.guild.channels.cache.get(config.modLogsChannelId);
                if (logsChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setColor('#ED4245')
                        .setTitle('🚨 Auto-Mod Violation Detected')
                        .addFields(
                            { name: 'User', value: `<@${message.author.id}> (${message.author.tag})`, inline: true },
                            { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
                            { name: 'Violation', value: violation, inline: false },
                            { name: 'Message Content', value: `\`\`\`${message.content.substring(0, 500)}\`\`\``, inline: false }
                        )
                        .setTimestamp();

                    await logsChannel.send({ embeds: [logEmbed] }).catch(() => {});
                }
            }
        }
    });

    // 4. Test Preview Command: §moderation
    client.on('messageCreate', async (message) => {
        if (message.author.bot || !message.guild) return;

        if (message.content.trim() === '§moderation') {
            const config = await ModerationConfig.findOne({ guildId: message.guild.id });

            if (!config) {
                return message.reply('⚠️ Please configure the moderation system using `/panel book:2 page:6` first!');
            }

            const staffList = config.staffRoleIds?.map(id => `<@&${id}>`).join(', ') || 'None';
            const linkList = config.linkAllowRoleIds?.map(id => `<@&${id}>`).join(', ') || 'None';
            const ipList = config.ipAllowRoleIds?.map(id => `<@&${id}>`).join(', ') || 'None';
            const logsCh = config.modLogsChannelId ? `<#${config.modLogsChannelId}>` : 'Not Set';

            const embed = new EmbedBuilder()
                .setColor('#ED4245')
                .setTitle('🛡️ [TEST PREVIEW] Moderation & Auto-Mod Config')
                .addFields(
                    { name: 'Staff Roles (Can use /staff)', value: staffList, inline: false },
                    { name: 'Link Whitelisted Roles', value: linkList, inline: true },
                    { name: 'IP / Advertise Whitelisted Roles', value: ipList, inline: true },
                    { name: 'Mod Logs Channel', value: logsCh, inline: false }
                )
                .setFooter({ text: 'Auto-Mod: Anti-Duplicate, Anti-Links, Anti-IP Active' })
                .setTimestamp();

            await message.reply({ embeds: [embed] });
        }
    });

    console.log('✔ Moderation handler loaded.');
};
            
