// commands/panel.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ServerSettings = require('../models/serverSettings');

const BOT_OWNERS = ['1549995551288852584', '1266728371719508062', '1474216218792558735'];

const PAGE_TO_FEATURE = {
    1: { key: 'welcome', name: 'Welcome System' },
    2: { key: 'ticket', name: 'Ticket System' },
    3: { key: 'onboarding', name: 'Onboarding System' },
    4: { key: 'stats', name: 'Server Stats' },
    5: { key: 'store', name: 'Store System' },
    6: { key: 'moderation', name: 'Moderation System' },
    7: { key: 'autoresponse', name: 'Auto Response' },
    8: { key: 'voicegen', name: 'Voice Generator' },
    9: { key: 'apply', name: 'Staff Application' },
    10: { key: 'youtube', name: 'YouTube Notifier' },
    11: { key: 'invite', name: 'Invite Tracker' },
    12: { key: 'goodbye', name: 'Goodbye System' },
    13: { key: 'leveling', name: 'Leveling System' },
    14: { key: 'botprofile', name: 'Bot Profile System' },
    15: { key: 'ai', name: 'Bot AI System' }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel')
        .setDescription('Bot configuration control panel by Books')
        .addIntegerOption(option =>
            option.setName('book')
                .setDescription('Select Book')
                .setRequired(true)
                .addChoices(
                    { name: 'Book 1 (Pages 1 - 5)', value: 1 },
                    { name: 'Book 2 (Pages 6 - 10)', value: 2 },
                    { name: 'Book 3 (Pages 11 - 15)', value: 3 }
                )
        )
        .addIntegerOption(option =>
            option.setName('page')
                .setDescription('Select Page Number')
                .setRequired(true)
                .addChoices(
                    // Book 1
                    { name: 'Page 1 - Welcome System (Book 1)', value: 1 },
                    { name: 'Page 2 - Ticket System (Book 1)', value: 2 },
                    { name: 'Page 3 - Onboarding System (Book 1)', value: 3 },
                    { name: 'Page 4 - Stats System (Book 1)', value: 4 },
                    { name: 'Page 5 - Store System (Book 1)', value: 5 },
                    // Book 2
                    { name: 'Page 6 - Moderation System (Book 2)', value: 6 },
                    { name: 'Page 7 - Auto Response (Book 2)', value: 7 },
                    { name: 'Page 8 - Voice Generator (Book 2)', value: 8 },
                    { name: 'Page 9 - Staff Application (Book 2)', value: 9 },
                    { name: 'Page 10 - YouTube Notifier (Book 2)', value: 10 },
                    // Book 3
                    { name: 'Page 11 - Invite System (Book 3)', value: 11 },
                    { name: 'Page 12 - Goodbye System (Book 3)', value: 12 },
                    { name: 'Page 13 - Leveling System (Book 3)', value: 13 },
                    { name: 'Page 14 - Bot Profile System (Book 3)', value: 14 },
                    { name: 'Page 15 - Bot AI System (Book 3)', value: 15 }
                )
        ),

    async execute(interaction) {
        const isBotOwner = BOT_OWNERS.includes(interaction.user.id);
        const book = interaction.options.getInteger('book');
        const page = interaction.options.getInteger('page');

        if (book === 1 && (page < 1 || page > 5)) {
            return interaction.reply({ content: '❌ Only **Pages 1 to 5** are available in Book 1.', ephemeral: true });
        }
        if (book === 2 && (page < 6 || page > 10)) {
            return interaction.reply({ content: '❌ Only **Pages 6 to 10** are available in Book 2.', ephemeral: true });
        }
        if (book === 3 && (page < 11 || page > 15)) {
            return interaction.reply({ content: '❌ Only **Pages 11 to 15** are available in Book 3.', ephemeral: true });
        }

        const featureInfo = PAGE_TO_FEATURE[page];
        if (featureInfo && !isBotOwner) {
            const settings = await ServerSettings.findOne({ guildId: interaction.guild.id });
            if (!settings || !settings.features || !settings.features[featureInfo.key]) {
                return interaction.reply({
                    content: `❌ The **${featureInfo.name}** is currently **DISABLED** for this server by the Bot Owner.\nPlease contact the Bot Owner to enable this module.`,
                    ephemeral: true
                });
            }
        }

        // BOOK 1
        if (page === 1) {
            const embed = new EmbedBuilder().setTitle('⚙️ [Book 1] Welcome System').setDescription('Configure custom welcome messages, channels, and embed banners.').setColor('#5865F2');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_welcome_modal').setLabel('Setup Welcome').setEmoji('👋').setStyle(ButtonStyle.Primary)
            );
            return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        } else if (page === 2) {
            const embed = new EmbedBuilder().setTitle('⚙️ [Book 1] Ticket System').setDescription('Configure interactive ticket creation panels and transcript channels.').setColor('#5865F2');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_ticket_modal').setLabel('Setup Ticket').setEmoji('🎫').setStyle(ButtonStyle.Primary)
            );
            return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        } else if (page === 3) {
            const embed = new EmbedBuilder().setTitle('⚙️ [Book 1] Onboarding System').setDescription('Configure step-by-step role assignment menus.').setColor('#5865F2');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_onboarding_modal').setLabel('Setup Onboarding').setEmoji('🔰').setStyle(ButtonStyle.Primary)
            );
            return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        } else if (page === 4) {
            const embed = new EmbedBuilder().setTitle('⚙️ [Book 1] Server Stats').setDescription('Configure automated counter channels for members, bots, and roles.').setColor('#5865F2');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_stats_modal').setLabel('Setup Stats').setEmoji('📊').setStyle(ButtonStyle.Primary)
            );
            return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        } else if (page === 5) {
            const embed = new EmbedBuilder().setTitle('⚙️ [Book 1] Store System').setDescription('Configure server in-game store products, prices, and categories.').setColor('#5865F2');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_store_modal').setLabel('Setup Store').setEmoji('🛒').setStyle(ButtonStyle.Primary)
            );
            return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

        // BOOK 2
        } else if (page === 6) {
            const embed = new EmbedBuilder().setTitle('⚙️ [Book 2] Moderation System').setDescription('Configure automod filters, blocked keywords, and staff roles.').setColor('#ED4245');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_mod_modal').setLabel('Setup Moderation').setEmoji('🛡️').setStyle(ButtonStyle.Danger)
            );
            return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        } else if (page === 7) {
            const embed = new EmbedBuilder().setTitle('⚙️ [Book 2] Auto Response System').setDescription('Configure automated response triggers for words, links, or IPs.').setColor('#5865F2');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_autoresponse_modal').setLabel('Setup Auto Response').setEmoji('🤖').setStyle(ButtonStyle.Primary)
            );
            return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        } else if (page === 8) {
            const embed = new EmbedBuilder().setTitle('⚙️ [Book 2] Voice Generator System').setDescription('Configure dynamic join-to-create voice channels.').setColor('#5865F2');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_tempvc_modal').setLabel('Setup Voice Generator').setEmoji('🔊').setStyle(ButtonStyle.Primary)
            );
            return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        } else if (page === 9) {
            const embed = new EmbedBuilder().setTitle('⚙️ [Book 2] Staff Application System').setDescription('Configure custom interview questions and reviewer channels.').setColor('#5865F2');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_apply_modal').setLabel('Setup Applications').setEmoji('📝').setStyle(ButtonStyle.Primary)
            );
            return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        } else if (page === 10) {
            const embed = new EmbedBuilder().setTitle('⚙️ [Book 2] YouTube Notifier System').setDescription('Link YouTube channel ID for automatic upload notifications.').setColor('#FF0000');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_yt_modal').setLabel('Setup YouTube Notifier').setEmoji('▶️').setStyle(ButtonStyle.Danger)
            );
            return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

        // BOOK 3
        } else if (page === 11) {
            const embed = new EmbedBuilder().setTitle('⚙️ [Book 3] Invite Tracker System').setDescription('Configure member invite tracking notifications and logs.').setColor('#5865F2');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_invite_modal').setLabel('Setup Invite System').setEmoji('🔗').setStyle(ButtonStyle.Primary)
            );
            return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        } else if (page === 12) {
            const embed = new EmbedBuilder().setTitle('⚙️ [Book 3] Goodbye System').setDescription('Configure departure alerts, custom leave messages, and channels.').setColor('#ED4245');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_goodbye_modal').setLabel('Setup Goodbye').setEmoji('👋').setStyle(ButtonStyle.Danger)
            );
            return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        } else if (page === 13) {
            const embed = new EmbedBuilder().setTitle('⚙️ [Book 3] Leveling System').setDescription('Configure text/voice XP gain, rank-up notifications, and reward roles.').setColor('#F1C40F');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_leveling_modal').setLabel('Setup Leveling').setEmoji('🏆').setStyle(ButtonStyle.Primary)
            );
            return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        } else if (page === 14) {
            const embed = new EmbedBuilder().setTitle('⚙️ [Book 3] Bot Profile System').setDescription('Customize the bot\'s server-specific profile nickname, banner, and bio.').setColor('#9B59B6');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_botprofile_modal').setLabel('Setup Bot Profile').setEmoji('👤').setStyle(ButtonStyle.Primary)
            );
            return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        } else if (page === 15) {
            const embed = new EmbedBuilder().setTitle('⚙️ [Book 3] Bot AI System').setDescription('Configure AI conversational channels, personality prompts, and model parameters.').setColor('#2ECC71');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_ai_modal').setLabel('Setup Bot AI').setEmoji('🧠').setStyle(ButtonStyle.Success)
            );
            return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        }
    }
};
                                                                                                           
