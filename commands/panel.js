const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel')
        .setDescription('Bot configuration control panel')
        .addIntegerOption(option => 
            option.setName('page')
                .setDescription('Select panel page')
                .setRequired(true)
                .addChoices(
                    { name: 'Page 1 - Welcome System', value: 1 },
                    { name: 'Page 2 - Ticket System', value: 2 },
                    { name: 'Page 3 - Onboarding System', value: 3 },
                    { name: 'Page 4 - Stats System', value: 4 },
                    { name: 'Page 5 - Store System', value: 5 },
                    { name: 'Page 6 - Moderation System', value: 6 }
                )
        ),
    async execute(interaction) {
        const page = interaction.options.getInteger('page');

        if (page === 1) {
            const panelEmbed = new EmbedBuilder()
                .setTitle('⚙️ Welcome System Setup Panel')
                .setDescription('Welcome system configure karne ke liye niche diye gaye button par click karein.')
                .setColor('#5865F2');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_welcome_modal').setLabel('Setup Welcome').setStyle(ButtonStyle.Primary)
            );
            await interaction.reply({ embeds: [panelEmbed], components: [row], ephemeral: true });
        } else if (page === 2) {
            const panelEmbed = new EmbedBuilder()
                .setTitle('⚙️ Ticket System Setup Panel')
                .setDescription('Ticket system configure karne ke liye niche diye gaye button par click karein.')
                .setColor('#5865F2');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_ticket_modal').setLabel('Setup Ticket').setStyle(ButtonStyle.Primary)
            );
            await interaction.reply({ embeds: [panelEmbed], components: [row], ephemeral: true });
        } else if (page === 3) {
            const panelEmbed = new EmbedBuilder()
                .setTitle('⚙️ Onboarding System Setup Panel')
                .setDescription('Onboarding system configure karne ke liye niche click karein.')
                .setColor('#5865F2');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_onboarding_modal').setLabel('Setup Onboarding').setStyle(ButtonStyle.Primary)
            );
            await interaction.reply({ embeds: [panelEmbed], components: [row], ephemeral: true });
        } else if (page === 4) {
            const panelEmbed = new EmbedBuilder()
                .setTitle('⚙️ Server Stats Setup Panel')
                .setDescription('Server Stats counter configure karne ke liye niche click karein.')
                .setColor('#5865F2');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_stats_modal').setLabel('Setup Stats').setStyle(ButtonStyle.Primary)
            );
            await interaction.reply({ embeds: [panelEmbed], components: [row], ephemeral: true });
        } else if (page === 5) {
            const panelEmbed = new EmbedBuilder()
                .setTitle('⚙️ Store System Setup Panel')
                .setDescription('Store & Shop system configure karne ke liye niche click karein.')
                .setColor('#5865F2');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_store_modal').setLabel('Setup Store').setStyle(ButtonStyle.Primary)
            );
            await interaction.reply({ embeds: [panelEmbed], components: [row], ephemeral: true });
        } else if (page === 6) {
            const panelEmbed = new EmbedBuilder()
                .setTitle('⚙️ Moderation & Auto-Mod Setup Panel')
                .setDescription('Staff Roles, Link/IP filter permissions aur Auto-Mod rules configure karne ke liye niche button par click karein.')
                .setColor('#ED4245');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_mod_modal').setLabel('Setup Moderation').setStyle(ButtonStyle.Danger)
            );
            await interaction.reply({ embeds: [panelEmbed], components: [row], ephemeral: true });
        }
    }
};
