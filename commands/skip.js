const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Current gaana skip karke agle track par jump karein'),

    async execute(interaction) {
        const queue = interaction.client.player?.nodes.get(interaction.guildId);
        if (!queue || !queue.isPlaying()) {
            return interaction.reply({ content: '❌ Abhi koi gaana play nahi ho raha hai.', ephemeral: true });
        }

        if (!interaction.member.voice.channel || interaction.member.voice.channel.id !== queue.channel.id) {
            return interaction.reply({ content: '❌ Aapko bot ke voice channel me hona zaroori hai.', ephemeral: true });
        }

        const currentTrack = queue.currentTrack;
        queue.node.skip();
        return interaction.reply(`⏭️ Skipped: **${currentTrack?.title || 'Unknown Track'}**`);
    }
};
