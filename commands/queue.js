const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Server ki active music queue list dekhein'),

    async execute(interaction) {
        const queue = interaction.client.player?.nodes.get(interaction.guildId);
        if (!queue || !queue.isPlaying()) {
            return interaction.reply({ content: '❌ Queue abhi khaali hai.', ephemeral: true });
        }

        const currentTrack = queue.currentTrack;
        const tracks = queue.tracks.toArray().slice(0, 10);

        const trackList = tracks.map((track, i) => `**${i + 1}.** [${track.title}](${track.url}) - \`${track.duration}\``).join('\n');

        const embed = new EmbedBuilder()
            .setColor('#2ECC71')
            .setTitle(`🎶 Music Queue: ${interaction.guild.name}`)
            .setDescription(`**Now Playing:**\n[${currentTrack.title}](${currentTrack.url}) - \`${currentTrack.duration}\`\n\n**Upcoming Tracks:**\n${trackList || '*No other tracks in queue*'}`)
            .setFooter({ text: `Total Songs in Queue: ${queue.tracks.size + 1}` })
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }
};
