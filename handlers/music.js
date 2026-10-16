const { isFeatureEnabled } = require('../utils/featureCheck');
const BOT_OWNERS = [
    '1549995551288852584', // FOUZAN
    '1266728371719508062', // FZBOY
    '1474216218792558735'  // DAREQUEEN
];
const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder 
} = require('discord.js');
const { Poru } = require('poru');
const Music247 = require('../models/music247');
const GuildConfig = require('../models/guildConfig');
const CustomPlaylist = require('../models/customPlaylist');

const autoplayMap = new Map();
const previousTracks = new Map();
const errorCounter = new Map();

// Voice Channel Subtitle Status (Set & Clear)
async function updateVoiceStatus(client, channelId, statusText = '') {
    if (!channelId) return;
    try {
        const channel = client.channels.cache.get(channelId);
        if (channel && typeof channel.setStatus === 'function') {
            await channel.setStatus(statusText).catch(() => {});
        } else {
            await client.rest.put(`/channels/${channelId}/voice-status`, {
                body: { status: statusText }
            }).catch(() => {});
        }
    } catch (_) {}
}

// High-Res Artwork Resolver
function getTrackThumbnail(track) {
    if (track.info?.image?.startsWith('http')) return track.info.image;
    if (track.info?.artworkUrl?.startsWith('http')) return track.info.artworkUrl;
    return 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=1000&auto=format&fit=crop';
}

// Controller Components
function getPanelComponents(player = null) {
    const isLoop = player ? player.loop === 'TRACK' : false;
    const isAutoplay = player ? (autoplayMap.get(player.guildId) ?? true) : true;

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_pause').setEmoji('⏸️').setStyle(ButtonStyle.Secondary).setDisabled(!player || !player.currentTrack),
        new ButtonBuilder().setCustomId('btn_previous').setEmoji('⏮️').setStyle(ButtonStyle.Secondary).setDisabled(!player || !player.currentTrack),
        new ButtonBuilder().setCustomId('btn_stop').setEmoji('🛑').setStyle(ButtonStyle.Danger).setDisabled(!player || !player.currentTrack),
        new ButtonBuilder().setCustomId('btn_next').setEmoji('⏯️').setStyle(ButtonStyle.Secondary).setDisabled(!player || !player.currentTrack),
        new ButtonBuilder().setCustomId('btn_resume').setEmoji('▶️').setStyle(ButtonStyle.Success).setDisabled(!player || !player.currentTrack)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_loop_track').setEmoji('♾️').setStyle(isLoop ? ButtonStyle.Primary : ButtonStyle.Secondary).setDisabled(!player || !player.currentTrack),
        new ButtonBuilder().setCustomId('btn_voldown').setEmoji('🔉').setStyle(ButtonStyle.Secondary).setDisabled(!player || !player.currentTrack),
        new ButtonBuilder().setCustomId('btn_autoplay').setEmoji('🔁').setStyle(isAutoplay ? ButtonStyle.Primary : ButtonStyle.Secondary).setDisabled(!player || !player.currentTrack),
        new ButtonBuilder().setCustomId('btn_volup').setEmoji('🔊').setStyle(ButtonStyle.Secondary).setDisabled(!player || !player.currentTrack),
        new ButtonBuilder().setCustomId('btn_save_playlist').setEmoji('💾').setStyle(ButtonStyle.Secondary).setDisabled(!player || !player.currentTrack)
    );

    const row3 = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('menu_filters')
            .setPlaceholder('Select an audio filter...')
            .setDisabled(!player || !player.currentTrack)
            .addOptions([
                { label: 'Bassboost', description: 'Deep low-end frequencies', value: 'f_bass', emoji: '🔊' },
                { label: 'Ultra Bass', description: 'Maximum bass amplification', value: 'f_ultrabass', emoji: '💥' },
                { label: 'Nightcore', description: 'Higher tempo & pitch', value: 'f_nightcore', emoji: '⚡' },
                { label: 'Vaporwave', description: 'Slowed down aesthetic lo-fi', value: 'f_vaporwave', emoji: '🌊' },
                { label: '8D Audio', description: 'Surround 360 rotating effect', value: 'f_8d', emoji: '🎧' },
                { label: 'Pop', description: 'Crisp vocal clarity profile', value: 'f_pop', emoji: '🎤' },
                { label: 'Soft', description: 'Calm and muffled relaxing curve', value: 'f_soft', emoji: '🍃' },
                { label: 'Treblebass', description: 'Enhanced highs and lows', value: 'f_treblebass', emoji: '🎚️' },
                { label: 'Electronic', description: 'Aggressive EDM frequency response', value: 'f_electronic', emoji: '⚡' },
                { label: 'Karaoke', description: 'Suppress center vocal channel', value: 'f_karaoke', emoji: '🎙️' },
                { label: 'Slowed', description: 'Deep slowed atmospheric playback', value: 'f_slowed', emoji: '⏳' },
                { label: 'Clear Filters', description: 'Reset all equalizers & effects', value: 'f_clear', emoji: '❌' }
            ])
    );

    return [row1, row2, row3];
}

// Embed Builder
function getPanelEmbed(client, player = null, track = null) {
    if (!player || !track) {
        return new EmbedBuilder()
            .setColor('#2B2D31')
            .setTitle('🎶 SparkCore Music Control Panel')
            .setDescription('**No song is currently playing.**\nJoin a voice channel and type `%play <song name or link>` to begin.')
            .setImage('https://dummyimage.com/1280x360/1e1f22/7289da&text=SparkCore+Audio+Engine+Ready')
            .setFooter({ text: 'SparkCore Music System • Standby' });
    }

    const duration = track.info.isStream ? 'LIVE' : new Date(track.info.length).toISOString().substr(14, 5);
    const isAutoplay = (autoplayMap.get(player.guildId) ?? true) ? 'Enabled' : 'Disabled';
    const thumbnail = getTrackThumbnail(track);
    const source = (track.info.sourceName || 'Audio').toUpperCase();

    return new EmbedBuilder()
        .setColor('#5865F2')
        .setDescription(`## <a:play_rec:1559415361290641429> Now Playing...\n\n[**${track.info.title}**](${track.info.uri})\n\n> **Author:** \`${track.info.author}\` • **Source:** \`${source}\`\n> **Duration:** \`${duration}\` • **Volume:** \`${player.volume}%\`\n> **Autoplay:** \`${isAutoplay}\` • **Loop:** \`${player.loop}\`\n> **Voice Channel:** <#${player.voiceChannel}>`)
        .setImage(thumbnail)
        .setFooter({ text: `Requested by ${track.info.requester?.username || 'System'}` });
}

// Live Panel Refresh
async function updateGuildPanel(client, guildId, player = null, track = null) {
    try {
        const conf = await GuildConfig.findOne({ guildId });
        if (!conf || !conf.panelChannelId || !conf.panelMessageId) return;

        const channel = client.channels.cache.get(conf.panelChannelId);
        if (!channel) return;

        const msg = await channel.messages.fetch(conf.panelMessageId).catch(() => null);
        if (!msg) return;

        await msg.edit({
            embeds: [getPanelEmbed(client, player, track)],
            components: getPanelComponents(player)
        });
    } catch (_) {}
}

// Autoplay Engine
async function playNextAutoplay(poru, player, client) {
    const lastTrack = previousTracks.get(player.guildId) || player.currentTrack;
    if (!lastTrack) return;

    try {
        const query = `${lastTrack.info.author} audio`;
        let res = await poru.resolve({ query, source: 'scsearch', requester: client.user });

        if (!res || !res.tracks?.length) {
            res = await poru.resolve({ query: `${lastTrack.info.title}`, source: 'scsearch', requester: client.user });
        }

        if (res?.tracks?.length) {
            const filtered = res.tracks.filter(t => t.info.title !== lastTrack.info.title);
            const next = filtered.length ? filtered[Math.floor(Math.random() * Math.min(filtered.length, 5))] : res.tracks[0];
            player.queue.add(next);
            return player.play();
        }
    } catch (_) {}
}

module.exports = async (client) => {
    const nodes = [
        {
            name: 'SparkCore-Private-Lavalink',
            host: 'lavalink-production-84c3.up.railway.app',
            port: 443,
            password: 'sparkcore123',
            secure: true
        }
    ];

    const poru = new Poru(client, nodes, {
        library: 'discord.js',
        defaultPlatform: 'scsearch',
        reconnectTries: Infinity,
        reconnectTimeout: 10000
    });

    client.poru = poru;
    client.autoplayMap = autoplayMap;
    client.getPanelEmbed = getPanelEmbed;
    client.getPanelComponents = getPanelComponents;
    client.updateGuildPanel = updateGuildPanel;

    // Node Connect
    poru.on('nodeConnect', async (node) => {
        console.log(`✔ Private Lavalink Online: ${node.name}`);
        try {
            const records = await Music247.find({ enabled: true });
            for (const rec of records) {
                const guild = client.guilds.cache.get(rec.guildId);
                if (!guild) continue;
                const vc = guild.channels.cache.get(rec.voiceChannelId);
                if (!vc) continue;

                let player = poru.players.get(rec.guildId);
                if (!player) {
                    poru.createConnection({
                        guildId: rec.guildId,
                        voiceChannel: rec.voiceChannelId,
                        textChannel: rec.textChannelId,
                        deaf: true
                    });
                }
            }
        } catch (_) {}
    });

    poru.on('nodeError', (node, error) => {
        console.warn(`⚠️ Lavalink Node Warning on [${node.name}]:${error.message}`);
    });

    // Track Start Listener
    poru.on('trackStart', async (player, track) => {
        errorCounter.set(player.guildId, 0);

        if (player.currentTrack) {
            previousTracks.set(player.guildId, player.currentTrack);
        }

        await updateVoiceStatus(
            client, 
            player.voiceChannel, 
            `<a:play_rec:1559415361290641429> ${track.info.title.substring(0, 35)}`
        );

        if (player.volume !== 100) player.setVolume(100);

        try {
            const activePlaylists = await CustomPlaylist.find({ recording: true });
            for (const pl of activePlaylists) {
                if (pl.tracks.length < 10) {
                    pl.tracks.push({
                        title: track.info.title,
                        uri: track.info.uri,
                        author: track.info.author,
                        length: track.info.length
                    });
                    if (pl.tracks.length >= 10) pl.recording = false;
                    await pl.save();
                }
            }
        } catch (_) {}

        await updateGuildPanel(client, player.guildId, player, track);
    });

    // Track Error Listener
    poru.on('trackError', async (player, track, error) => {
        console.error(`⚠️ Playback Failed for [${track.info.title}]:`, error);
        const count = (errorCounter.get(player.guildId) || 0) + 1;
        errorCounter.set(player.guildId, count);

        if (count >= 2) {
            player.queue.clear();
            const textChan = client.channels.cache.get(player.textChannel);
            if (textChan) {
                textChan.send(`⚠️ Stream Error on \`${track.info.title}\`. Autoplay stopped to prevent skipping spam.`).catch(() => {});
            }
            errorCounter.set(player.guildId, 0);
            return player.destroy();
        }
    });

    // Queue End
    poru.on('queueEnd', async (player) => {
        const errs = errorCounter.get(player.guildId) || 0;
        const isAutoplay = autoplayMap.get(player.guildId) ?? true;

        if (isAutoplay && errs === 0) {
            return await playNextAutoplay(poru, player, client);
        }

        await updateVoiceStatus(client, player.voiceChannel, '');
        await updateGuildPanel(client, player.guildId, null, null);

        const rec247 = await Music247.findOne({ guildId: player.guildId, enabled: true });
        if (rec247) {
            if (player.voiceChannel !== rec247.voiceChannelId) {
                player.setVoiceChannel(rec247.voiceChannelId);
            }
        } else {
            player.destroy();
        }
    });

    // VC Empty
    client.on('voiceStateUpdate', async (oldState, newState) => {
        const guildId = oldState.guild.id || newState.guild.id;
        const player = poru.players.get(guildId);
        if (!player) return;

        const currentChannel = oldState.guild.channels.cache.get(player.voiceChannel);
        if (!currentChannel) return;

        const humans = currentChannel.members.filter(m => !m.user.bot);
        if (humans.size === 0) {
            await updateVoiceStatus(client, currentChannel.id, '');

            const rec247 = await Music247.findOne({ guildId, enabled: true });
            if (rec247) {
                player.queue.clear();
                if (typeof player.skip === 'function') player.skip();
                if (player.voiceChannel !== rec247.voiceChannelId) {
                    player.setVoiceChannel(rec247.voiceChannelId);
                }
                await updateVoiceStatus(client, rec247.voiceChannelId, '');
                await updateGuildPanel(client, guildId, null, null);
            } else {
                player.destroy();
            }
        }
    });

    client.once('ready', () => {
        poru.init(client);
    });

    // ==========================================
    // PREFIX COMMANDS (%...)
    // ==========================================
    client.on('messageCreate', async (message) => {
        if (message.guild && !(await isFeatureEnabled(message.guild.id, 'music'))) return;
        if (message.author.bot || !message.guild) return;

        const PREFIX = '%';
        if (!message.content.startsWith(PREFIX)) return;

        const args = message.content.slice(PREFIX.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        // %music
        if (commandName === 'music' && (!args[0] || args[0].toLowerCase() !== 'panel')) {
            const helpEmbed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('🎶 SparkCore Music Commands')
                .setDescription('Prefix: `%`\n\n' +
                    '`%play <song name or link>` — Play track\n' +
                    '`%join` — Summon bot to voice\n' +
                    '`%stop` — Stop playback\n' +
                    '`%skip` — Skip track\n' +
                    '`%24/7` — Toggle 24/7 channel standby\n' +
                    '`%music panel` or `%setup` — Setup live music controller panel'
                );
            return message.reply({ embeds: [helpEmbed] });
        }

        // %setup / %music panel
        if (commandName === 'setup' || (commandName === 'music' && args[0]?.toLowerCase() === 'panel')) {
            const isOwner = message.guild.ownerId === message.author.id;
            const isAdmin = message.member.permissions.has('Administrator');
            const conf = await GuildConfig.findOne({ guildId: message.guild.id }).catch(() => null);
            const isExtraOwner = conf?.extraOwners?.includes(message.author.id);

            if (!BOT_OWNERS.includes(message.author.id) && !isOwner && !isAdmin && !isExtraOwner) {
                return message.reply('❌ Only Server Owners, Admins, or Extra Owners can setup the panel.');
            }

            const embed = getPanelEmbed(client, null, null);
            const components = getPanelComponents(null);
            const panelMsg = await message.channel.send({ embeds: [embed], components });

            await GuildConfig.findOneAndUpdate(
                { guildId: message.guild.id },
                { panelChannelId: message.channel.id, panelMessageId: panelMsg.id },
                { upsert: true }
            );

            return message.reply(`✅ Control Panel successfully deployed in <#${message.channel.id}>!`);
        }

        // %join
        if (commandName === 'join') {
            const vc = message.member.voice.channel;
            if (!vc) return message.reply('❌ You must join a voice channel first.');

            let player = poru.players.get(message.guild.id);
            if (!player) {
                player = poru.createConnection({
                    guildId: message.guild.id,
                    voiceChannel: vc.id,
                    textChannel: message.channel.id,
                    deaf: true
                });
            } else {
                player.setVoiceChannel(vc.id);
            }
            return message.reply(`🔊 Connected to <#${vc.id}>.`);
        }

        // %play (100% Working Audio Stream Engine)
        if (commandName === 'play' || commandName === 'p') {
            const vc = message.member.voice.channel;
            if (!vc) return message.reply('❌ Please join a voice channel first.');

            const query = args.join(' ').trim();
            if (!query) return message.reply('❌ Enter a song name or link: `%play <query>`');

            let player = poru.players.get(message.guild.id);
            let isNew = false;
            if (!player) {
                player = poru.createConnection({
                    guildId: message.guild.id,
                    voiceChannel: vc.id,
                    textChannel: message.channel.id,
                    deaf: true
                });
                isNew = true;
            }

            const statusMsg = await message.reply('🔍 Searching audio stream...');

            try {
                let res = null;

                // 1. Direct Links (SoundCloud / Spotify / HTTP)
                if (query.startsWith('http://') || query.startsWith('https://')) {
                    res = await poru.resolve({ query, requester: message.author });
                }

                // 2. Search Keyword: YouTube block bypass karne ke liye Force SCSEARCH (SoundCloud)
                if (!res || !res.tracks?.length) {
                    res = await poru.resolve({ query: `scsearch:${query}`, requester: message.author });
                }
                if (!res || !res.tracks?.length) {
                    res = await poru.resolve({ query: `scsearch:${query} audio`, requester: message.author });
                }

                if (!res || !res.tracks?.length) {
                    return statusMsg.edit(`❌ Audio not found for: **${query}**`);
                }

                if (isNew) await new Promise(r => setTimeout(r, 600));

                if (res.loadType === 'PLAYLIST_LOADED') {
                    for (const t of res.tracks) player.queue.add(t);
                    if (!player.isPlaying && !player.isPaused) player.play();
                    return statusMsg.edit(`🎶 Added playlist **${res.playlistInfo.name}** (\`${res.tracks.length}\` tracks) to queue.`);
                }

                const track = res.tracks[0];
                player.queue.add(track);

                if (!player.isPlaying && !player.isPaused) {
                    player.play();
                    return statusMsg.edit(`🎶 Now playing: **${track.info.title}**`);
                } else {
                    return statusMsg.edit(`✅ Added to queue: **${track.info.title}**`);
                }
            } catch (err) {
                return statusMsg.edit(`❌ Playback error: \`${err.message}\``);
            }
        }

        // %stop
        if (commandName === 'stop') {
            const player = poru.players.get(message.guild.id);
            if (!player) return message.reply('❌ Bot is not active.');

            previousTracks.delete(message.guild.id);
            player.queue.clear();
            await updateVoiceStatus(client, player.voiceChannel, '');

            const rec247 = await Music247.findOne({ guildId: message.guild.id, enabled: true });
            if (rec247) {
                if (typeof player.skip === 'function') player.skip();
                if (player.voiceChannel !== rec247.voiceChannelId) {
                    player.setVoiceChannel(rec247.voiceChannelId);
                }
            } else {
                player.destroy();
            }

            await updateGuildPanel(client, message.guild.id, null, null);
            return message.reply('🛑 Stopped playback.');
        }

        // %skip
        if (commandName === 'skip' || commandName === 's') {
            const player = poru.players.get(message.guild.id);
            if (!player || !player.currentTrack) return message.reply('❌ Nothing is playing.');
            if (typeof player.skip === 'function') player.skip();
            return message.reply('⏭️ Track skipped.');
        }

        // %24/7
        if (commandName === '24/7' || commandName === '247') {
            const isOwner = message.guild.ownerId === message.author.id;
            const isAdmin = message.member.permissions.has('Administrator');
            if (!BOT_OWNERS.includes(message.author.id) && !isOwner && !isAdmin) return message.reply('Only server owner/admins can toggle 24/7 mode.');

            const vc = message.member.voice.channel;
            if (!vc) return message.reply('❌ Join the target 24/7 voice channel first.');

            const existing = await Music247.findOne({ guildId: message.guild.id, enabled: true });
            if (existing) {
                await Music247.findOneAndUpdate({ guildId: message.guild.id }, { enabled: false });
                return message.reply('🔓 **24/7 Mode Disabled!**');
            } else {
                await Music247.findOneAndUpdate(
                    { guildId: message.guild.id },
                    { voiceChannelId: vc.id, textChannelId: message.channel.id, enabled: true },
                    { upsert: true }
                );
                return message.reply(`🔒 **24/7 Mode Active!** Home channel: <#${vc.id}>.`);
            }
        }
    });

    // Control Panel Buttons
    client.on('interactionCreate', async (interaction) => {
        if (interaction.guild && !(await isFeatureEnabled(interaction.guild.id, 'music'))) return;
        if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;
        if (!interaction.customId.startsWith('btn_') && interaction.customId !== 'menu_filters') return;

        const player = poru.players.get(interaction.guildId);
        if (!player || !player.currentTrack) {
            return interaction.reply({ content: '❌ No active audio stream.', flags: 64 });
        }

        if (!interaction.member.voice?.channel || interaction.member.voice.channel.id !== player.voiceChannel) {
            return interaction.reply({ content: `❌ You must be inside <#${player.voiceChannel}> to control playback.`, flags: 64 });
        }

        if (interaction.isStringSelectMenu() && interaction.customId === 'menu_filters') {
            const val = interaction.values[0];
            await interaction.deferUpdate();

            if (val === 'f_bass') player.filters.setEqualizer([{ band: 0, gain: 0.35 }, { band: 1, gain: 0.25 }, { band: 2, gain: 0.15 }]);
            else if (val === 'f_ultrabass') player.filters.setEqualizer([{ band: 0, gain: 0.60 }, { band: 1, gain: 0.50 }, { band: 2, gain: 0.35 }]);
            else if (val === 'f_nightcore') player.filters.setTimescale({ speed: 1.25, pitch: 1.25, rate: 1.0 });
            else if (val === 'f_vaporwave') player.filters.setTimescale({ speed: 0.85, pitch: 0.80, rate: 1.0 });
            else if (val === 'f_8d') player.filters.setRotation({ rotationHz: 0.2 });
            else if (val === 'f_pop') player.filters.setEqualizer([{ band: 1, gain: 0.2 }, { band: 2, gain: 0.3 }, { band: 3, gain: 0.1 }]);
            else if (val === 'f_soft') player.filters.setLowPass({ smoothing: 20.0 });
            else if (val === 'f_treblebass') player.filters.setEqualizer([{ band: 0, gain: 0.3 }, { band: 12, gain: 0.3 }, { band: 13, gain: 0.35 }]);
            else if (val === 'f_electronic') player.filters.setEqualizer([{ band: 0, gain: 0.35 }, { band: 5, gain: 0.25 }, { band: 13, gain: 0.3 }]);
            else if (val === 'f_karaoke') player.filters.setKaraoke({ level: 1.0, monoLevel: 1.0, filterBand: 220.0, filterWidth: 100.0 });
            else if (val === 'f_slowed') player.filters.setTimescale({ speed: 0.75, pitch: 0.85, rate: 1.0 });
            else if (val === 'f_clear') player.filters.clearFilters();
            return;
        }

        const id = interaction.customId;

        if (id === 'btn_pause') {
            player.pause(true);
            await updateGuildPanel(client, player.guildId, player, player.currentTrack);
            return interaction.reply({ content: '⏸️ Paused playback.', flags: 64 });
        }
        if (id === 'btn_resume') {
            player.pause(false);
            await updateGuildPanel(client, player.guildId, player, player.currentTrack);
            return interaction.reply({ content: '▶️ Resumed playback.', flags: 64 });
        }
        if (id === 'btn_next') {
            const title = player.currentTrack.info.title;
            if (player.queue.length > 0) {
                if (typeof player.skip === 'function') player.skip();
            } else {
                await playNextAutoplay(poru, player, client);
            }
            return interaction.reply({ content: `⏭️ Playing next after **${title}**.`, flags: 64 });
        }
        if (id === 'btn_previous') {
            const prev = previousTracks.get(interaction.guildId);
            if (!prev) return interaction.reply({ content: '❌ No previous song recorded.', flags: 64 });
            player.queue.unshift(prev);
            if (typeof player.skip === 'function') player.skip();
            return interaction.reply({ content: `⏮️ Playing previous: **${prev.info.title}**`, flags: 64 });
        }
        if (id === 'btn_stop') {
            previousTracks.delete(interaction.guildId);
            player.queue.clear();
            await updateVoiceStatus(client, player.voiceChannel, '');

            const rec247 = await Music247.findOne({ guildId: interaction.guildId, enabled: true });
            if (rec247) {
                if (typeof player.skip === 'function') player.skip();
                if (player.voiceChannel !== rec247.voiceChannelId) {
                    player.setVoiceChannel(rec247.voiceChannelId);
                }
            } else {
                player.destroy();
            }
            await updateGuildPanel(client, player.guildId, null, null);
            return interaction.reply({ content: '🛑 Playback terminated.', flags: 64 });
        }
        if (id === 'btn_loop_track') {
            player.setLoop(player.loop === 'TRACK' ? 'NONE' : 'TRACK');
            await updateGuildPanel(client, player.guildId, player, player.currentTrack);
            return interaction.reply({ content: `♾️ Track Repeat: **${player.loop === 'TRACK' ? 'Enabled' : 'Disabled'}**.`, flags: 64 });
        }
        if (id === 'btn_autoplay') {
            const current = autoplayMap.get(interaction.guildId) ?? true;
            autoplayMap.set(interaction.guildId, !current);
            await updateGuildPanel(client, player.guildId, player, player.currentTrack);
            return interaction.reply({ content: `🔁 Endless Autoplay: **${!current ? 'Enabled' : 'Disabled'}**.`, flags: 64 });
        }
        if (id === 'btn_volup') {
            const newVol = Math.min(player.volume + 10, 150);
            player.setVolume(newVol);
            await updateGuildPanel(client, player.guildId, player, player.currentTrack);
            return interaction.reply({ content: `🔊 Volume: **${newVol}%**`, flags: 64 });
        }
        if (id === 'btn_voldown') {
            const newVol = Math.max(player.volume - 10, 10);
            player.setVolume(newVol);
            await updateGuildPanel(client, player.guildId, player, player.currentTrack);
            return interaction.reply({ content: `🔉 Volume: **${newVol}%**`, flags: 64 });
        }
    });

    console.log('✔ Custom Rythm Music Engine (Anti-Spam Stream Guard Active).');
};
