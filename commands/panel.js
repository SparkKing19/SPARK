const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

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
                    { name: 'Book 2 (Pages 6 - 10)', value: 2 }
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
                    { name: 'Page 10 - YouTube Notifier (Book 2)', value: 10 }
                )
        ),
    async execute(interaction) {
        const book = interaction.options.getInteger('book');
        const page = interaction.options.getInteger('page');

        if (book === 1 && (page < 1 || page > 5)) {
            return interaction.reply({ content: '❌ Book 1 me sirf **Page 1 se 5** tak available hain!', ephemeral: true });
        }
        if (book === 2 && (page < 6 || page > 10)) {
            return interaction.reply({ content: '❌ Book 2 me sirf **Page 6 se 10** tak available hain!', ephemeral: true });
        }

        // ================= BOOK 1 =================
        if (page === 1) {
            const embed = new EmbedBuilder().setTitle('⚙️ [Book 1] Welcome System').setDescription('Configure welcome system.').setColor('#5865F2');
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_welcome_modal').setLabel('Setup Welcome').setStyle(ButtonStyle.Primary));
            await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

        } else if (page === 2) {
            const embed = new EmbedBuilder().setTitle('⚙️ [Book 1] Ticket System').setDescription('Configure ticket system.').setColor('#5865F2');
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_ticket_modal').setLabel('Setup Ticket').setStyle(ButtonStyle.Primary));
            await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

        } else if (page === 3) {
            const embed = new EmbedBuilder().setTitle('⚙️ [Book 1] Onboarding System').setDescription('Configure onboarding system.').setColor('#5865F2');
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_onboarding_modal').setLabel('Setup Onboarding').setStyle(ButtonStyle.Primary));
            await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

        } else if (page === 4) {
            const embed = new EmbedBuilder().setTitle('⚙️ [Book 1] Server Stats').setDescription('Configure live stats.').setColor('#5865F2');
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_stats_modal').setLabel('Setup Stats').setStyle(ButtonStyle.Primary));
            await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

        } else if (page === 5) {
            const embed = new EmbedBuilder().setTitle('⚙️ [Book 1] Store System').setDescription('Configure in-game store.').setColor('#5865F2');
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_store_modal').setLabel('Setup Store').setStyle(ButtonStyle.Primary));
            await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

        // ================= BOOK 2 =================
        } else if (page === 6) {
            const embed = new EmbedBuilder().setTitle('⚙️ [Book 2] Moderation System').setDescription('Configure automod & staff permissions.').setColor('#ED4245');
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_mod_modal').setLabel('Setup Moderation').setStyle(ButtonStyle.Danger));
            await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

        } else if (page === 7) {
            const embed = new EmbedBuilder().setTitle('⚙️ [Book 2] Auto Response System').setDescription('Configure custom word/IP/URL triggers.').setColor('#5865F2');
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_autoresponse_modal').setLabel('Setup Auto Response').setStyle(ButtonStyle.Primary));
            await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

        } else if (page === 8) {
            const embed = new EmbedBuilder().setTitle('⚙️ [Book 2] Voice Generator System').setDescription('Configure join-to-create voice channels.').setColor('#5865F2');
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_tempvc_modal').setLabel('Setup Voice Generator').setStyle(ButtonStyle.Primary));
            await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

        } else if (page === 9) {
            const embed = new EmbedBuilder().setTitle('⚙️ [Book 2] Staff Application System').setDescription('Configure application questions & review channels.').setColor('#5865F2');
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_apply_modal').setLabel('Setup Applications').setStyle(ButtonStyle.Primary));
            await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

        } else if (page === 10) {
            const embed = new EmbedBuilder().setTitle('⚙️ [Book 2] YouTube Notifier System').setDescription('Link YouTube channel for automatic video upload announcements.').setColor('#FF0000');
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_yt_modal').setLabel('Setup YouTube Notifier').setStyle(ButtonStyle.Danger));
            await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        }
    }
};
            
