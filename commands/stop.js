const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Music band karein aur bot ko VC se disconnect karein'),

    async execute(interaction) {
        const queue = interaction.client.player?.nodes.get(interaction.guildId);
        if (!queue) {
            return interaction.reply({ content: '❌ Bot kisi voice channel me active nahi hai.', ephemeral: true });
        }

        queue.delete();
        return interaction.reply('⏹️ Music stopped and disconnected from voice channel.');
    }
};
