const { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus, 
    VoiceConnectionStatus, 
    entersState 
} = require('@discordjs/voice');
const playdl = require('play-dl');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ModerationConfig = require('../models/moderation');
const MusicConfig = require('../models/musicConfig');

const BOT_OWNERS = ['1266728371719508062', '1474216218792558735'];

// guildId -> { connection, player, queue: [], current: null, hostId: null, channel: null, isPlaying: false, loop: false }
const serverQueues = new Map();

async function checkIsOwner(guild, userId) {
    if (BOT_OWNERS.includes(userId)) return true;
    if (guild.ownerId === userId) return true;
    const modConfig = await ModerationConfig.findOne({ guildId: guild.id });
    if (modConfig?.extraOwners && modConfig.extraOwners.includes(userId)) return true;
    return false;
}

async function playNext(guildId) {
    const sQueue = serverQueues.get(guildId);
    if (!sQueue) return;

    if (sQueue.queue.length === 0) {
        sQueue.isPlaying = false;
        sQueue.current = null;
        const mConfig = await MusicConfig.findOne({ guildId });
        if (!mConfig?.isAlwaysOn) {
            setTimeout(() => {
                const check = serverQueues.get(guildId);
                if (check && !check.isPlaying && check.queue.length === 0) {
                    check.connection?.destroy();
                    serverQueues.delete(guildId);
                }
            }, 60000);
        }
        return;
    }

    const track = sQueue.loop && sQueue.current ? sQueue.current : sQueue.queue.shift();
    sQueue.current = track;
    sQueue.isPlaying = true;

    try {
        let stream = null;

        // 1. YouTube direct stream attempt
        if (track.source === 'yt' || track.url.includes('youtube.com') || track.url.includes('youtu.be')) {
            try {
                stream = await playdl.stream(track.url, { quality: 2 });
            } catch (_) {
                stream = null;
            }
        }

        // 2. SoundCloud fallback (client_id safe)
        if (!stream) {
            try {
                let scTrackUrl = track.source === 'sc' ? track.url : null;
                if (!scTrackUrl) {
                    const scResults = await playdl.search(track.title, { source: { soundcloud: 'tracks' }, limit: 1 }).catch(() => []);
                    if (scResults && scResults.length > 0) {
                        scTrackUrl = scResults[0].url;
                    }
                }
                if (scTrackUrl) {
                    stream = await playdl.stream(scTrackUrl);
                }
            } catch (scErr) {
                console.error('SoundCloud stream error:', scErr);
            }
        }

        if (!stream) {
            sQueue.channel?.send(`⚠️ Stream fetch nahi ho saki: **${track.title}**, skipping to next...`);
            return playNext(guildId);
        }

        const resource = createAudioResource(stream.stream, {
            inputType: stream.type,
            inlineVolume: true
        });
        resource.volume?.setVolume(0.8);

        sQueue.player.play(resource);

        const embed = new EmbedBuilder()
            .setColor('#2ECC71')
            .setTitle('🎶 Now Playing')
            .setDescription(`**[${track.title}](${track.url})**`)
            .addFields(
                { name: 'Duration', value: `\`${track.duration || 'Live/Unknown'}\``, inline: true },
                { name: 'Host / Controller', value: `<@${sQueue.hostId}>`, inline: true }
            )
            .setThumbnail(track.thumbnail || null);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('m_pause_resume').setLabel('Pause / Resume').setEmoji('⏯️').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('m_skip').setLabel('Skip').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('m_stop').setLabel('Stop').setEmoji('⏹️').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('m_loop').setLabel('Loop').setEmoji('🔁').setStyle(ButtonStyle.Secondary)
        );

        sQueue.channel?.send({ embeds: [embed], components: [row] }).catch(() => {});
    } catch (err) {
        console.error('Play Stream Error:', err);
        sQueue.channel?.send(`⚠️ Error playing track: \`${err.message}\``);
        playNext(guildId);
    }
}

module.exports = async (client) => {
    // Client ID initialize for SoundCloud (Fixes client_id undefined crash)
    try {
        const scClientID = await playdl.getFreeClientID().catch(() => null);
        if (scClientID) {
            await playdl.setToken({ soundcloud: { client_id: scClientID } }).catch(() => {});
            console.log('✔ SoundCloud Free Client ID Initialized.');
        }
    } catch (e) {
        console.error('Failed to init SoundCloud token:', e);
    }

    client.on('messageCreate', async (message) => {
        if (message.author.bot || !message.guild || !message.content.startsWith('%')) return;

        const args = message.content.slice(1).trim().split(/ +/);
        const cmd = args.shift()?.toLowerCase();
        const isOwner = await checkIsOwner(message.guild, message.author.id);

        // %join & %join always
        if (cmd === 'join') {
            if (!isOwner) return message.reply('❌ Sirf Bot Owner, Server Owner ya Extra Owner hi `%join` chala sakte hain.');
            const vc = message.member?.voice?.channel;
            if (!vc) return message.reply('❌ Pehle kisi Voice Channel me join karo!');

            const sub = args[0]?.toLowerCase();
            let mConfig = await MusicConfig.findOne({ guildId: message.guild.id }) || new MusicConfig({ guildId: message.guild.id });

            if (sub === 'always') {
                if (mConfig.isAlwaysOn && mConfig.alwaysChannelId === vc.id) {
                    mConfig.isAlwaysOn = false;
                    mConfig.alwaysChannelId = null;
                    await mConfig.save();
                    return message.reply(`🔓 <#${vc.id}> se Always-On mode hata diya gaya.`);
                } else {
                    mConfig.isAlwaysOn = true;
                    mConfig.alwaysChannelId = vc.id;
                    await mConfig.save();
                }
            }

            joinVoiceChannel({
                channelId: vc.id,
                guildId: message.guild.id,
                adapterCreator: message.guild.voiceAdapterCreator
            });

            return message.reply(`✅ Connected to **${vc.name}**!`);
        }

        // %play
        if (cmd === 'play' || cmd === 'p') {
            const query = args.join(' ');
            if (!query) return message.reply('ℹ️ **Usage:** `%play <song name ya link>`');

            const vc = message.member?.voice?.channel;
            if (!vc) return message.reply('❌ Pehle kisi Voice Channel me join karo!');

            let sQueue = serverQueues.get(message.guild.id);
            if (sQueue && sQueue.hostId && sQueue.hostId !== message.author.id && !isOwner) {
                if (vc.members.has(sQueue.hostId)) {
                    return message.reply(`⚠️ Music abhi <@${sQueue.hostId}> ke control me hai!`);
                }
            }

            const waitMsg = await message.reply('🔍 Searching audio stream...');

            let trackInfo = null;
            try {
                // Direct Link Check
                if (query.startsWith('http')) {
                    if (query.includes('soundcloud.com')) {
                        const scData = await playdl.soundcloud(query).catch(() => null);
                        if (scData) {
                            trackInfo = {
                                title: scData.name,
                                url: scData.url,
                                duration: scData.durationInSec ? `${Math.floor(scData.durationInSec / 60)}:${scData.durationInSec % 60}` : 'Unknown',
                                thumbnail: scData.thumbnail,
                                source: 'sc'
                            };
                        }
                    } else {
                        const info = await playdl.video_info(query).catch(() => null);
                        if (info) {
                            trackInfo = {
                                title: info.video_details.title,
                                url: info.video_details.url,
                                duration: info.video_details.durationRaw,
                                thumbnail: info.video_details.thumbnails[0]?.url,
                                source: 'yt'
                            };
                        }
                    }
                }

                // Title Search
                if (!trackInfo) {
                    const ytSearch = await playdl.search(query, { limit: 1, source: { youtube: 'video' } }).catch(() => []);
                    if (ytSearch && ytSearch.length > 0) {
                        trackInfo = {
                            title: ytSearch[0].title,
                            url: ytSearch[0].url,
                            duration: ytSearch[0].durationRaw,
                            thumbnail: ytSearch[0].thumbnails[0]?.url,
                            source: 'yt'
                        };
                    } else {
                        const scSearch = await playdl.search(query, { limit: 1, source: { soundcloud: 'tracks' } }).catch(() => []);
                        if (scSearch && scSearch.length > 0) {
                            trackInfo = {
                                title: scSearch[0].name,
                                url: scSearch[0].url,
                                duration: scSearch[0].durationInSec ? `${Math.floor(scSearch[0].durationInSec / 60)}:${scSearch[0].durationInSec % 60}` : 'Unknown',
                                thumbnail: scSearch[0].thumbnail,
                                source: 'sc'
                            };
                        }
                    }
                }

                if (!trackInfo) return waitMsg.edit('❌ Koi song match nahi hua.');

                if (!sQueue) {
                    const connection = joinVoiceChannel({
                        channelId: vc.id,
                        guildId: message.guild.id,
                        adapterCreator: message.guild.voiceAdapterCreator
                    });

                    const player = createAudioPlayer();
                    connection.subscribe(player);

                    player.on(AudioPlayerStatus.Idle, () => playNext(message.guild.id));
                    player.on('error', (err) => {
                        console.error('Audio Player Internal Error:', err);
                        playNext(message.guild.id);
                    });

                    sQueue = {
                        connection,
                        player,
                        queue: [],
                        current: null,
                        hostId: message.author.id,
                        channel: message.channel,
                        isPlaying: false,
                        loop: false
                    };
                    serverQueues.set(message.guild.id, sQueue);
                }

                sQueue.channel = message.channel;
                if (!sQueue.hostId) sQueue.hostId = message.author.id;
                sQueue.queue.push(trackInfo);

                await waitMsg.edit(`✅ Added to queue: **${trackInfo.title}**\n🔒 **Host:** <@${sQueue.hostId}>`);

                if (!sQueue.isPlaying) {
                    playNext(message.guild.id);
                }
            } catch (err) {
                console.error('Play command error:', err);
                return waitMsg.edit(`❌ Playback error: \`${err.message}\``);
            }
        }

        // Controls
        const sQueue = serverQueues.get(message.guild.id);
        const canControl = () => isOwner || (sQueue && sQueue.hostId === message.author.id);

        if (cmd === 'skip') {
            if (!sQueue || !sQueue.isPlaying) return message.reply('❌ Koi song play nahi ho raha.');
            if (!canControl()) return message.reply(`❌ Sirf host <@${sQueue.hostId}> skip kar sakta hai!`);
            sQueue.player.stop();
            return message.reply('⏭️ Track skipped!');
        }

        if (cmd === 'stop') {
            if (!sQueue) return message.reply('❌ Bot VC me nahi hai.');
            if (!canControl()) return message.reply('❌ Control denied.');
            sQueue.queue = [];
            sQueue.player.stop();
            sQueue.connection?.destroy();
            serverQueues.delete(message.guild.id);
            return message.reply('⏹️ Stopped and disconnected.');
        }

        if (cmd === 'pause') {
            if (!sQueue || !sQueue.isPlaying) return message.reply('❌ Koi song play nahi ho raha.');
            if (!canControl()) return message.reply('❌ Control denied.');
            sQueue.player.pause();
            return message.reply('⏸️ Paused.');
        }

        if (cmd === 'resume') {
            if (!sQueue) return message.reply('❌ Koi playback nahi hai.');
            if (!canControl()) return message.reply('❌ Control denied.');
            sQueue.player.unpause();
            return message.reply('▶️ Resumed.');
        }

        if (cmd === 'loop') {
            if (!sQueue || !sQueue.isPlaying) return message.reply('❌ Koi song play nahi ho raha.');
            if (!canControl()) return message.reply('❌ Control denied.');
            sQueue.loop = !sQueue.loop;
            return message.reply(`🔁 Loop: **${sQueue.loop ? 'ON' : 'OFF'}**`);
        }
    });

    // Button interactions
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isButton() || !interaction.customId.startsWith('m_')) return;
        const sQueue = serverQueues.get(interaction.guild.id);
        if (!sQueue || !sQueue.isPlaying) return interaction.reply({ content: '❌ Inactive playback.', ephemeral: true });

        const isOwner = await checkIsOwner(interaction.guild, interaction.user.id);
        if (sQueue.hostId !== interaction.user.id && !isOwner) {
            return interaction.reply({ content: `⚠️ Controller locked hai host <@${sQueue.hostId}> ke paas!`, ephemeral: true });
        }

        const action = interaction.customId.replace('m_', '');
        if (action === 'pause_resume') {
            if (sQueue.player.state.status === AudioPlayerStatus.Paused) {
                sQueue.player.unpause();
                return interaction.reply({ content: '▶️ Resumed.', ephemeral: true });
            } else {
                sQueue.player.pause();
                return interaction.reply({ content: '⏸️ Paused.', ephemeral: true });
            }
        }
        if (action === 'skip') {
            sQueue.player.stop();
            return interaction.reply({ content: '⏭️ Skipped.', ephemeral: true });
        }
        if (action === 'stop') {
            sQueue.queue = [];
            sQueue.player.stop();
            sQueue.connection?.destroy();
            serverQueues.delete(interaction.guild.id);
            return interaction.reply({ content: '⏹️ Stopped.', ephemeral: true });
        }
        if (action === 'loop') {
            sQueue.loop = !sQueue.loop;
            return interaction.reply({ content: `🔁 Loop: **${sQueue.loop ? 'ON' : 'OFF'}**`, ephemeral: true });
        }
    });
};
                        
