const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('p')
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
                    // Book 1 Choices
                    { name: 'Page 1 - Welcome System (Book 1)', value: 1 },
                    { name: 'Page 2 - Ticket System (Book 1)', value: 2 },
                    { name: 'Page 3 - Onboarding System (Book 1)', value: 3 },
                    { name: 'Page 4 - Stats System (Book 1)', value: 4 },
                    { name: 'Page 5 - Store System (Book 1)', value: 5 },
                    // Book 2 Choices
                    { name: 'Page 6 - Moderation System (Book 2)', value: 6 },
                    { name: 'Page 7 - Coming Soon (Book 2)', value: 7 },
                    { name: 'Page 8 - Coming Soon (Book 2)', value: 8 },
                    { name: 'Page 9 - Coming Soon (Book 2)', value: 9 },
                    { name: 'Page 10 - Coming Soon (Book 2)', value: 10 }
                )
        ),
    async execute(interaction) {
        const book = interaction.options.getInteger('book');
        const page = interaction.options.getInteger('page');

        // Validation Check: Book aur Page match
        if (book === 1 && (page < 1 || page > 5)) {
            return interaction.reply({ content: '❌ Book 1 me sirf **Page 1 se 5** tak available hain!', ephemeral: true });
        }
        if (book === 2 && (page < 6 || page > 10)) {
            return interaction.reply({ content: '❌ Book 2 me sirf **Page 6 se 10** tak available hain!', ephemeral: true });
        }

        // ================= BOOK 1 =================
        if (page === 1) {
            const panelEmbed = new EmbedBuilder()
                .setTitle('⚙️ [Book 1] Welcome System Setup Panel')
                .setDescription('Welcome system configure karne ke liye niche diye gaye button par click karein.')
                .setColor('#5865F2');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_welcome_modal').setLabel('Setup Welcome').setStyle(ButtonStyle.Primary)
            );
            await interaction.reply({ embeds: [panelEmbed], components: [row], ephemeral: true });

        } else if (page === 2) {
            const panelEmbed = new EmbedBuilder()
                .setTitle('⚙️ [Book 1] Ticket System Setup Panel')
                .setDescription('Ticket system configure karne ke liye niche diye gaye button par click karein.')
                .setColor('#5865F2');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_ticket_modal').setLabel('Setup Ticket').setStyle(ButtonStyle.Primary)
            );
            await interaction.reply({ embeds: [panelEmbed], components: [row], ephemeral: true });

        } else if (page === 3) {
            const panelEmbed = new EmbedBuilder()
                .setTitle('⚙️ [Book 1] Onboarding System Setup Panel')
                .setDescription('Onboarding / Self-Role system configure karne ke liye niche click karein.')
                .setColor('#5865F2');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_onboarding_modal').setLabel('Setup Onboarding').setStyle(ButtonStyle.Primary)
            );
            await interaction.reply({ embeds: [panelEmbed], components: [row], ephemeral: true });

        } else if (page === 4) {
            const panelEmbed = new EmbedBuilder()
                .setTitle('⚙️ [Book 1] Server Stats Setup Panel')
                .setDescription('Live Server Stats counter configure karne ke liye niche click karein.')
                .setColor('#5865F2');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_stats_modal').setLabel('Setup Stats').setStyle(ButtonStyle.Primary)
            );
            await interaction.reply({ embeds: [panelEmbed], components: [row], ephemeral: true });

        } else if (page === 5) {
            const panelEmbed = new EmbedBuilder()
                .setTitle('⚙️ [Book 1] Store System Setup Panel')
                .setDescription('Store & In-Game Shop system configure karne ke liye niche click karein.')
                .setColor('#5865F2');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_store_modal').setLabel('Setup Store').setStyle(ButtonStyle.Primary)
            );
            await interaction.reply({ embeds: [panelEmbed], components: [row], ephemeral: true });

        // ================= BOOK 2 =================
        } else if (page === 6) {
            const panelEmbed = new EmbedBuilder()
                .setTitle('⚙️ [Book 2] Moderation & Auto-Mod Setup Panel')
                .setDescription('Staff Roles, Link/IP filter permissions aur Auto-Mod rules configure karne ke liye niche diye gaye button par click karein.')
                .setColor('#ED4245');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_mod_modal').setLabel('Setup Moderation').setStyle(ButtonStyle.Danger)
            );
            await interaction.reply({ embeds: [panelEmbed], components: [row], ephemeral: true });

        } else if (page >= 7 && page <= 10) {
            await interaction.reply({ 
                content: `🚧 **[Book 2] Page ${page}** abhi development me hai aur agle update me live hoga!`, 
                ephemeral: true 
            });
        }
    }
};
