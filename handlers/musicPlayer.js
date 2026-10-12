const { LavalinkManager } = require('lavalink-client');
const { makePlayerEmbed, makePlayerButtons } = require('../utils/musicUtils');

module.exports = function registerMusicPlayer(client) {
    // Lavalink is a separate service. Keep the rest of SparkCore booting if it is not configured yet.
    const host = process.env.LAVALINK_HOST;
    const password = process.env.LAVALINK_PASSWORD;
    const port = Number(process.env.LAVALINK_PORT || 2333);
    if (!host || !password) {
        console.warn('[SPARK MUSIC] Lavalink not configured. Set LAVALINK_HOST, LAVALINK_PORT and LAVALINK_PASSWORD to enable music.');
        return;
    }

    client.lavalink = new LavalinkManager({
        nodes: [{
            id: process.env.LAVALINK_ID || 'spark-main',
            host,
            port,
            authorization: password,
            secure: String(process.env.LAVALINK_SECURE || 'false').toLowerCase() === 'true',
            retryAmount: 5,
            retryDelay: 10000
        }],
        sendToShard: (guildId, payload) => {
            const guild = client.guilds.cache.get(guildId);
            if (guild) guild.shard.send(payload);
        },
        autoSkip: true,
        client: {
            id: process.env.CLIENT_ID,
            username: process.env.MUSIC_BOT_NAME || 'SPARK Music'
        },
        playerOptions: {
            defaultSearchPlatform: process.env.MUSIC_SEARCH_PLATFORM || 'ytsearch',
            onDisconnect: { autoReconnect: true, destroyPlayer: false },
            onEmptyQueue: { destroyAfterMs: 60_000 },
            useUnresolvedData: true
        }
    });

    client.on('raw', packet => {
        client.lavalink?.sendRawData(packet)?.catch?.(() => {});
    });

    client.once('ready', async () => {
        try {
            await client.lavalink.init({ id: client.user.id, username: client.user.username });
            console.log('[SPARK MUSIC] Lavalink manager initialized.');
        } catch (error) {
            console.error('[SPARK MUSIC] Lavalink initialization failed:', error);
        }
    });

    client.lavalink.on('create', node => console.log(`[SPARK MUSIC] Lavalink node connected: ${node.id}`));
    client.lavalink.on('connect', node => console.log(`[SPARK MUSIC] Lavalink node ready: ${node.id}`));
    client.lavalink.on('error', (node, error) => console.error(`[SPARK MUSIC] Node ${node?.id || 'unknown'} error:`, error));
    client.lavalink.nodeManager.on('error', (node, error) => console.error(`[SPARK MUSIC] Node manager error (${node?.id || 'unknown'}):`, error));

    // Keep the public player panel updated when tracks change.
    client.lavalink.on('trackStart', async (player, track) => {
        const channel = client.channels.cache.get(player.textChannelId);
        if (!channel?.isTextBased()) return;
        const panel = client.musicPanels?.get(player.guildId);
        const embed = makePlayerEmbed(player, client, 'Playing');
        const components = makePlayerButtons(player);
        try {
            if (panel?.channelId === channel.id) {
                const oldMessage = await channel.messages.fetch(panel.messageId).catch(() => null);
                if (oldMessage) {
                    await oldMessage.edit({ embeds: [embed], components });
                    return;
                }
            }
            const message = await channel.send({ embeds: [embed], components });
            client.musicPanels ||= new Map();
            client.musicPanels.set(player.guildId, { channelId: channel.id, messageId: message.id });
        } catch (error) {
            console.error('[SPARK MUSIC] Could not update player panel:', error.message);
        }
    });

    client.lavalink.on('queueEnd', async player => {
        const channel = client.channels.cache.get(player.textChannelId);
        if (channel?.isTextBased()) {
            await channel.send('⏹️ Queue finished. Add another song with `%play <song name or URL>`.').catch(() => {});
        }
    });

    client.lavalink.on('trackError', (player, track, payload) => {
        console.error('[SPARK MUSIC] Track error:', payload?.exception?.message || payload?.error || 'Unknown track error');
        const channel = client.channels.cache.get(player.textChannelId);
        if (channel?.isTextBased()) channel.send('⚠️ This track could not be played. I will try to continue the queue.').catch(() => {});
    });

    // Interactive buttons for the music player. Only listeners in the same voice channel can control it.
    client.on('interactionCreate', async interaction => {
        if (!interaction.isButton() || !interaction.customId.startsWith('spark_music_')) return;
        if (!interaction.guild) return interaction.reply({ content: 'This control only works inside a server.', ephemeral: true });
        const player = client.lavalink.getPlayer(interaction.guildId);
        if (!player) return interaction.reply({ content: 'There is no active music player.', ephemeral: true });

        const memberVoice = interaction.member?.voice?.channelId;
        if (!memberVoice || memberVoice !== player.voiceChannelId) {
            return interaction.reply({ content: 'Join the same voice channel as the bot to use these controls.', ephemeral: true });
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
                    const current = player.repeatMode || player.get?.('repeatMode') || 'off';
                    const next = current === 'off' ? 'track' : current === 'track' ? 'queue' : 'off';
                    await player.setRepeatMode(next);
                    await interaction.reply({ content: `Repeat mode: **${next}**`, ephemeral: true });
                    return;
                }
                case 'spark_music_volume_down':
                    await player.setVolume(Math.max(0, Number(player.volume || 100) - 10));
                    break;
                case 'spark_music_volume_up':
                    await player.setVolume(Math.min(100, Number(player.volume || 100) + 10));
                    break;
                case 'spark_music_queue': {
                    const upcoming = player.queue.tracks || [];
                    const lines = upcoming.slice(0, 10).map((track, index) => `**${index + 1}.** ${track.info?.title || track.title || 'Unknown track'}`);
                    const currentTrack = player.queue.current;
                    return interaction.reply({
                        content: `**Queue**\nNow: ${currentTrack?.info?.title || currentTrack?.title || 'Nothing'}\n${lines.join('\n') || 'No upcoming songs.'}`,
                        ephemeral: true
                    });
                }
                case 'spark_music_refresh':
                case 'spark_music_previous':
                    if (interaction.customId === 'spark_music_previous') {
                        const previous = player.queue.previous?.[player.queue.previous.length - 1];
                        if (!previous) return interaction.reply({ content: 'No previous track is available.', ephemeral: true });
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
            const response = { content: 'That music action failed. Check whether the Lavalink node is online.', ephemeral: true };
            if (interaction.replied || interaction.deferred) await interaction.followUp(response).catch(() => {});
            else await interaction.reply(response).catch(() => {});
        }
    });
};
