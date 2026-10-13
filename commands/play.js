const { SlashCommandBuilder } = require('discord.js');

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
            return interaction.editReply('❌ Music system abhi initialize ho raha hai.');
        }

        const isOnline = Array.from(poru.nodes.values()).some(n => n.isConnected);
        if (!isOnline) {
            return interaction.editReply('⚠️ Audio server reconnect ho raha hai, 5 second baad dobara try karein.');
        }

        try {
            let player = poru.players.get(interaction.guildId);
            if (!player) {
                player = poru.createConnection({
                    guildId: interaction.guildId,
                    voiceChannel: memberVoice.id,
                    textChannel: interaction.channelId,
                    deaf: true
                });
            }

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
            console.error('Play error:', err);
            return interaction.editReply(`❌ Error: \`${err.message}\``);
        }
    }
};
