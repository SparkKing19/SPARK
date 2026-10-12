const { LavalinkManager } = require('lavalink-client');
const { makePlayerEmbed, makePlayerButtons } = require('../utils/musicUtils');

module.exports = function registerMusicPlayer(client) {
    const rawHost = process.env.LAVALINK_HOST || 'free-lava.heavencloud.in';
    const password = process.env.LAVALINK_PASSWORD || 'heavencloud.in';
    const port = Number(process.env.LAVALINK_PORT || 4000);
    const isSecure = String(process.env.LAVALINK_SECURE || 'false').toLowerCase() === 'true';

    const host = rawHost.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').trim();

    client.lavalink = new LavalinkManager({
        nodes: [{
            id: 'heavencloud-main',
            host: host,
            port: port,
            authorization: password,
            secure: isSecure,
            retryAmount: 15,
            retryDelay: 5000
        }],
        sendToShard: (guildId, payload) => {
            const guild = client.guilds.cache.get(guildId);
            if (guild) guild.shard.send(payload);
        },
        autoSkip: true,
        client: {
            id: process.env.CLIENT_ID || client.user?.id,
            username: client.user?.username || 'SPARK Music'
        },
        playerOptions: {
            defaultSearchPlatform: 'ytmsearch',
            onDisconnect: { autoReconnect: true, destroyPlayer: false },
            onEmptyQueue: { destroyAfterMs: 60_000 }
        }
    });

    // Voice packet forwarder
    client.on('raw', (d) => {
        client.lavalink?.sendRawData(d);
    });

    // Node Lifecycle Listeners
    client.lavalink.nodeManager.on('connect', (node) => {
        console.log(`[SPARK MUSIC] ✅ Node Connected: ${node.id} (${node.options.host}:${node.options.port})`);
    });

    client.lavalink.nodeManager.on('error', (node, error) => {
        console.error(`[SPARK MUSIC] ❌ Node Error on ${node?.id || 'unknown'}:`, error?.message || error);
    });

    client.lavalink.nodeManager.on('disconnect', (node, reason) => {
        console.warn(`[SPARK MUSIC] ⚠️ Node Disconnected:`, reason);
    });

    // Client Ready par Initialize + Node Connect Trigger
    const startLavalink = async () => {
        try {
            await client.lavalink.init({
                id: client.user.id,
                username: client.user.username
            });
            console.log('[SPARK MUSIC] Lavalink Manager initialized.');

            // Nodes ko explicit connect command bhejna
            for (const [, node] of client.lavalink.nodeManager.nodes) {
                if (!node.connected) {
                    node.connect();
                }
            }
        } catch (err) {
            console.error('[SPARK MUSIC] Lavalink Init Failed:', err);
        }
    };

    if (client.isReady()) {
        startLavalink();
    } else {
        client.once('ready', startLavalink);
    }

    // Player Track Events
    client.lavalink.on('trackStart', async (player, track) => {
        const channel = client.channels.cache.get(player.textChannelId);
        if (!channel?.isTextBased()) return;
        const embed = makePlayerEmbed(player, client, 'Playing');
        const components = makePlayerButtons(player);
        try {
            await channel.send({ embeds: [embed], components });
        } catch (e) {}
    });

    client.lavalink.on('queueEnd', async (player) => {
        const channel = client.channels.cache.get(player.textChannelId);
        if (channel?.isTextBased()) {
            await channel.send('⏹️ Queue finished. Add another song with `%play <song name or URL>`.').catch(() => {});
        }
    });

    client.lavalink.on('trackError', (player, track, payload) => {
        console.error('[SPARK MUSIC] Track error:', payload?.exception?.message || payload?.error || 'Unknown error');
        const channel = client.channels.cache.get(player.textChannelId);
        if (channel?.isTextBased()) {
            channel.send('⚠️ This track could not be played. Continuing next in queue...').catch(() => {});
        }
    });

    // Interactive Buttons
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isButton() || !interaction.customId.startsWith('spark_music_')) return;
        if (!interaction.guild) return interaction.reply({ content: 'This control only works inside a server.', ephemeral: true });

        const player = client.lavalink.getPlayer(interaction.guildId);
        if (!player) return interaction.reply({ content: 'There is no active music player.', ephemeral: true });

        const memberVoice = interaction.member?.voice?.channelId;
        if (!memberVoice || memberVoice !== player.voiceChannelId) {
            return interaction.reply({ content: 'Join the same voice channel to use these controls.', ephemeral: true });
        }

        try {
            switch (interaction.customId) {
                case 'spark_music_pause_resume':
                    if (player.paused) await player.resume(); else await player.pause();
                    break;
                case 'spark_music_skip':
                    await player.skip();
                    break;
                case 'spark_music_stop':
                    await player.stopPlaying(true);
                    break;
                case 'spark_music_loop': {
                    const current = player.repeatMode || 'off';
                    const next = current === 'off' ? 'track' : current === 'track' ? 'queue' : 'off';
                    await player.setRepeatMode(next);
                    return interaction.reply({ content: `Repeat mode: **${next}**`, ephemeral: true });
                }
                case 'spark_music_volume_down':
                    await player.setVolume(Math.max(0, Number(player.volume || 100) - 10));
                    break;
                case 'spark_music_volume_up':
                    await player.setVolume(Math.min(100, Number(player.volume || 100) + 10));
                    break;
                case 'spark_music_queue': {
                    const upcoming = player.queue.tracks || [];
                    const lines = upcoming.slice(0, 10).map((t, i) => `**${i + 1}.**${t.info?.title || t.title || 'Unknown track'}`);
                    const currentTrack = player.queue.current;
                    return interaction.reply({
                        content: `**Queue**\nNow: ${currentTrack?.info?.title \vert{}\vert{} currentTrack?.title \vert{}\vert{} 'Nothing'}\n${lines.join('\n') || 'No upcoming songs.'}`,
                        ephemeral: true
                    });
                }
                case 'spark_music_refresh':
                case 'spark_music_previous':
                    if (interaction.customId === 'spark_music_previous') {
                        const previous = player.queue.previous?.[player.queue.previous.length - 1];
                        if (!previous) return interaction.reply({ content: 'No previous track available.', ephemeral: true });
                        await player.play({ clientTrack: previous });
                    }
                    break;
                default:
                    return;
            }

            const embed = makePlayerEmbed(player, client, player.paused ? 'Paused' : 'Playing');
            await interaction.update({ embeds: [embed], components: makePlayerButtons(player) });
        } catch (error) {
            console.error('[SPARK MUSIC] Player button error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'Action failed. Lavalink node might be offline.', ephemeral: true }).catch(() => {});
            }
        }
    });
};
