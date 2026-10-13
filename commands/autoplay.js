const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('autoplay')
        .setDescription('Toggle music autoplay mode'),

    async execute(interaction) {
        const player = interaction.client.poru?.players.get(interaction.guildId);
        if (!player) {
            return interaction.reply({ content: '❌ Abhi bot kisi voice channel me active nahi hai.', ephemeral: true });
        }

        const state = interaction.client.autoplayState.get(interaction.guildId) || false;
        interaction.client.autoplayState.set(interaction.guildId, !state);

        return interaction.reply({ content: `♾️ Autoplay mode is now **${!state ? 'Enabled' : 'Disabled'}**!` });
    }
};
