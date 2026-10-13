const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Gaana play karo (YouTube, Spotify, SoundCloud, Search)')
        .addStringOption(opt => 
            opt.setName('query')
                .setDescription('Gaane ka naam ya link daalo')
                .setRequired(true)
        ),

    async execute(interaction) {
        const memberVoice = interaction.member.voice.channel;
        if (!memberVoice) {
            return interaction.reply({ content: '❌ Pehle kisi Voice Channel me connect ho jao!', ephemeral: true });
        }

        await interaction.deferReply();
        const query = interaction.options.getString('query');
        const poru = interaction.client.poru;

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

            const isUrl = query.startsWith('http://') || query.startsWith('https://');

            // Agar URL hai toh direct resolve, agar text search hai toh scsearch/spsearch priority
            let resolve = null;
            if (isUrl) {
                resolve = await poru.resolve({ query: query, requester: interaction.user });
            } else {
                // Try SoundCloud search first (Built-in Lavalink v4)
                resolve = await poru.resolve({ query: query, source: 'scsearch', requester: interaction.user });

                // Fallback to Spotify search if not found
                if (!resolve || !resolve.tracks || !resolve.tracks.length) {
                    resolve = await poru.resolve({ query: query, source: 'spsearch', requester: interaction.user });
                }

                // Fallback to ytsearch
                if (!resolve || !resolve.tracks || !resolve.tracks.length) {
                    resolve = await poru.resolve({ query: query, source: 'ytsearch', requester: interaction.user });
                }
            }

            const { loadType, tracks, playlistInfo } = resolve || {};

            if (!resolve || loadType === 'LOAD_FAILED' || loadType === 'NO_MATCHES' || !tracks || !tracks.length) {
                return interaction.editReply(`❌ Koi gaana nahi mila: **${query}**\n*(Tip: Agar title se na mile toh YouTube/Spotify ka direct link paste karein)*`);
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
            return interaction.editReply(`❌ Play error: \`${err.message}\``);
        }
    }
};
