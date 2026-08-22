const { 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder, 
    EmbedBuilder, 
    PermissionFlagsBits 
} = require('discord.js');
const ModerationConfig = require('../models/moderation');

const userCooldowns = new Map(); // userId -> lastTimestamp
const lastMessages = new Map();   // userId -> { content, timestamp }

// Advanced Regex Matchers
const LINK_REGEX = /(https?:\/\/[^\s]+)|(discord\.(gg|io|me|li)\/[^\s]+)|(discordapp\.com\/invite\/[^\s]+)/i;
const IP_REGEX = /\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/i;
const DOMAIN_REGEX = /(?:[a-zA-Z0-9-]+\.)+(?:com|net|org|io|me|xyz|gg|in|play|server|site|store|online|tech|info|co)(?::\d+)?/i;

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = (client) => {

    // 1. Setup Modal (/panel Book 2 Page 6)
    client.on('interactionCreate', async (interaction) => {
        if (interaction.isButton() && interaction.customId === 'open_mod_modal') {
            const data = await ModerationConfig.findOne({ guildId: interaction.guild.id }) || {};

            const modal = new ModalBuilder()
                .setCustomId('mod_config_modal')
                .setTitle('Moderation & Auto-Mod Setup');

            const wordsInput = new TextInputBuilder()
                .setCustomId('mod_bad_words')
                .setLabel('Blocked Words (Comma Separated)')
                .setPlaceholder('bkl, mc, bc, scam, raid')
                .setStyle(TextInputStyle.Paragraph)
                .setValue(data.badWords?.join(', ') || '')
                .setRequired(false);

            const togglesInput = new TextInputBuilder()
                .setCustomId('mod_toggles')
                .setLabel('Block: Links,Media,Ips,Domains,Urls (yes/no)')
                .setPlaceholder('yes, no, yes, yes, yes')
                .setStyle(TextInputStyle.Short)
                .setValue(`${data.blockLinks ? 'yes' : 'no'}, ${data.blockMedia ? 'yes' : 'no'}, ${data.blockIps ? 'yes' : 'no'}, ${data.blockDomains ? 'yes' : 'no'}, ${data.blockUrls ? 'yes' : 'no'}`)
                .setRequired(true);

            const rolesInput = new TextInputBuilder()
                .setCustomId('mod_staff_roles')
                .setLabel('Staff Role IDs (Comma Separated)')
                .setPlaceholder('123456789, 987654321')
                .setStyle(TextInputStyle.Short)
                .setValue(data.staffRoleIds?.join(', ') || '')
                .setRequired(false);

            const logsInput = new TextInputBuilder()
                .setCustomId('mod_logs_channel')
                .setLabel('Mod Logs Channel ID')
                .setPlaceholder('123456789012345678')
                .setStyle(TextInputStyle.Short)
                .setValue(data.modLogsChannelId || '')
                .setRequired(false);

            modal.addComponents(
                new ActionRowBuilder().addComponents(wordsInput),
                new ActionRowBuilder().addComponents(togglesInput),
                new ActionRowBuilder().addComponents(rolesInput),
                new ActionRowBuilder().addComponents(logsInput)
            );

            await interaction.showModal(modal);
        }

        if (interaction.isModalSubmit() && interaction.customId === 'mod_config_modal') {
            await interaction.deferReply({ ephemeral: true });

            const badWords = interaction.fields.getTextInputValue('mod_bad_words')
                .split(',')
                .map(w => w.trim().toLowerCase())
                .filter(Boolean);

            const toggles = interaction.fields.getTextInputValue('mod_toggles')
                .split(',')
                .map(t => t.trim().toLowerCase() === 'yes');

            const staffRoleIds = interaction.fields.getTextInputValue('mod_staff_roles')
                .split(',')
                .map(r => r.trim())
                .filter(Boolean);

            const modLogsChannelId = interaction.fields.getTextInputValue('mod_logs_channel').trim() || null;

            await ModerationConfig.findOneAndUpdate(
                { guildId: interaction.guild.id },
                {
                    badWords,
                    blockLinks: toggles[0] ?? true,
                    blockMedia: toggles[1] ?? false,
                    blockIps: toggles[2] ?? true,
                    blockDomains: toggles[3] ?? true,
                    blockUrls: toggles[4] ?? true,
                    staffRoleIds,
                    modLogsChannelId
                },
                { upsert: true, new: true }
            );

            await interaction.editReply({ content: '✅ Advanced Moderation & Auto-Mod rules saved successfully!' });
        }
    });

    // 2. High-Performance AutoMod Engine
    client.on('messageCreate', async (message) => {
        if (message.author.bot || !message.guild) return;

        const config = await ModerationConfig.findOne({ guildId: message.guild.id });
        if (!config) return;

        const member = message.member;
        if (!member) return;

        // Bypass checks: Server Owner, Extra Owners, Whitelist
        const isOwner = member.id === message.guild.ownerId;
        const isExtraOwner = config.extraOwners.includes(member.id);
        const isWhitelisted = config.whitelistedUsers.includes(member.id);
        const isStaff = config.staffRoleIds?.some(id => member.roles.cache.has(id));

        if (isOwner || isExtraOwner || isWhitelisted || isStaff) return;

        const now = Date.now();
        const content = message.content.trim();
        const lowerContent = content.toLowerCase();
        let violation = null;

        // A. 3-Second Chat Cooldown
        const lastChatTime = userCooldowns.get(message.author.id) || 0;
        if (now - lastChatTime < 3000) {
            await message.delete().catch(() => {});
            const warn = await message.channel.send(`⚠️ <@${message.author.id}>, please wait 3 seconds before sending another message!`);
            setTimeout(() => warn.delete().catch(() => {}), 3000);
            return;
        }
        userCooldowns.set(message.author.id, now);

        // B. Anti-Duplicate Message Check (10s window)
        const lastMsg = lastMessages.get(message.author.id);
        if (lastMsg && lastMsg.content === lowerContent && (now - lastMsg.time) < 10000 && lowerContent.length > 2) {
            violation = 'Repeated / Duplicate Message Spam';
        } else {
            lastMessages.set(message.author.id, { content: lowerContent, time: now });
        }

        // Channel Overrides Check
        const channelRule = config.channelOverrides?.get(message.channel.id);

        // C. Word Boundary Bad Words Filter (Allows compound words like SparkleMc)
        if (!violation && config.badWords && config.badWords.length > 0) {
            const hasBadWord = config.badWords.some(word => {
                const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'i');
                return regex.test(content);
            });
            if (hasBadWord) violation = 'Blacklisted Word / Slur Usage';
        }

        // D. Media Block Check
        if (!violation && config.blockMedia && !channelRule?.allowMedia) {
            if (message.attachments.size > 0 || message.embeds.some(e => e.image || e.video)) {
                violation = 'Unauthorized Media / Attachments';
            }
        }

        // E. IP Address Block
        if (!violation && config.blockIps && !channelRule?.allowIps && IP_REGEX.test(content)) {
            violation = 'Unauthorized Server IP Address';
        }

        // F. Domain & URL Block
        if (!violation && (config.blockDomains || config.blockUrls || config.blockLinks) && !channelRule?.allowLinks) {
            if (LINK_REGEX.test(content) || DOMAIN_REGEX.test(content)) {
                violation = 'Unauthorized Link / Domain / Invite URL';
            }
        }

        // Violation Enforcement
        if (violation) {
            await message.delete().catch(() => {});
            const alert = await message.channel.send(`⚠️ <@${message.author.id}>, your message was removed: **${violation}**`);
            setTimeout(() => alert.delete().catch(() => {}), 4000);

            if (config.modLogsChannelId) {
                const logCh = message.guild.channels.cache.get(config.modLogsChannelId);
                if (logCh) {
                    const logEmbed = new EmbedBuilder()
                        .setColor('#ED4245')
                        .setTitle('🚨 Auto-Mod Violation Detected')
                        .addFields(
                            { name: 'User', value: `<@${message.author.id}> (${message.author.tag})`, inline: true },
                            { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
                            { name: 'Violation Reason', value: violation, inline: false },
                            { name: 'Intercepted Content', value: `\`\`\`${content.substring(0, 500) || '[Media/Embed]'}\`\`\``, inline: false }
                        )
                        .setTimestamp();
                    await logCh.send({ embeds: [logEmbed] }).catch(() => {});
                }
            }
        }
    });

    console.log('✔ Moderation Auto-Mod handler loaded.');
};
                        
