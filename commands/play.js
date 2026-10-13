const { SlashCommandBuilder } = require('discord.js');

// Helper function to safely get or create player with wait
async function getOrCreatePlayer(poru, guildId, voiceChannelId, textChannelId) {
    let player = poru.players.get(guildId);
    if (player) return player;

    for (let i = 0; i < 5; i++) {
        const hasNode = poru.leastUsedNodes.some(n => n.isConnected);
        if (hasNode) {
            try {
                return poru.createConnection({
                    guildId,
                    voiceChannel: voiceChannelId,
                    textChannel: textChannelId,
                    deaf: true
                });
            } catch (e) {}
        }
        await new Promise(res => setTimeout(res, 800));
    }
    return null;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Gaana play karo (YouTube, Spotify, SoundCloud, Link)')
        .addStringOption(opt => 
            opt.setName('query')
                .setDescription('Gaane ka naam ya URL daalo')
                .setRequired(true)
        ),

    async execute(interaction) {
        const memberVoice = interaction.member.voice.channel;
        if (!memberVoice) {
            return interaction.reply({ content: '❌ Pehle kisi Voice Channel me connect ho jao!', ephemeral: true });
        }

        try {
            await interaction.deferReply();
        } catch {
            return;
        }

        const query = interaction.options.getString('query');
        const poru = interaction.client.poru;

        if (!poru) {
            return interaction.editReply('❌ Music engine load ho raha hai, kuch der me try karein.');
        }

        const player = await getOrCreatePlayer(poru, interaction.guildId, memberVoice.id, interaction.channelId);
        if (!player) {
            return interaction.editReply('⚠️ Audio server reconnect ho raha hai, kripya 5 second baad command dubara run karein.');
        }

        try {
            const resolve = await poru.resolve({ query: query, source: 'ytsearch', requester: interaction.user });
            const { loadType, tracks, playlistInfo } = resolve;

            if (loadType === 'LOAD_FAILED' || loadType === 'NO_MATCHES' || !tracks || !tracks.length) {
                return interaction.editReply(`❌ Koi gaana nahi mila: **${query}**`);
            }

            if (loadType === 'PLAYLIST_LOADED') {
                for (const track of tracks) {
                    player.queue.add(track);
                }
                if (!player.isPlaying && !player.isPaused) player.play();
                return interaction.editReply(`🎶 Playlist queued: **${playlistInfo.name}** (\`${tracks.length}\` songs)`);
            }

            const track = tracks[0];
            player.queue.add(track);

            if (!player.isPlaying && !player.isPaused) {
                player.play();
                return interaction.editReply(`🎶 Playing: **${track.info.title}**`);
            } else {
                return interaction.editReply(`✅ Added to Queue: **${track.info.title}**`);
            }
        } catch (err) {
            console.error('Play command error:', err);
            return interaction.editReply(`❌ Error: \`${err.message}\``);
        }
    }
};
