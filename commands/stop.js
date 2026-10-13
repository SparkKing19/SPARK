const { SlashCommandBuilder } = require('discord.js');
const Music247 = require('../models/music247');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Music band karein aur bot ko disconnect karein'),

    async execute(interaction) {
        const player = interaction.client.poru?.players.get(interaction.guildId);
        if (!player) {
            return interaction.reply({ content: '❌ Bot active nahi hai.', ephemeral: true });
        }

        const is247 = await Music247.findOne({ guildId: interaction.guildId, enabled: true }).catch(() => null);
        player.queue.clear();
        player.stop();

        if (!is247) {
            player.destroy();
            return interaction.reply('⏹️ Music stopped and disconnected.');
        }

        return interaction.reply('⏹️ Music stopped (24/7 mode active).');
    }
};
