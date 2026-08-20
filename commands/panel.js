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
                    { name: 'Page 1 - Welcome System', value: 1 }
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
                new ButtonBuilder()
                    .setCustomId('open_welcome_modal')
                    .setLabel('Setup Welcome')
                    .setStyle(ButtonStyle.Primary)
            );

            await interaction.reply({ embeds: [panelEmbed], components: [row], ephemeral: true });
        }
    }
};
