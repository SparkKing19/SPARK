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
        // play-dl direct stream
        let stream = await playdl.stream(track.url, { quality: 2 }).catch(async () => {
            // agar YouTube stream block ho, soundcloud par search karke stream uthao
            const sc = await playdl.search(track.title, { source: { soundcloud: 'tracks' }, limit: 1 });
            if (sc.length > 0) return await playdl.stream(sc[0].url);
            return null;
        });

        if (!stream) {
            sQueue.channel?.send(`⚠️ Stream nahi mil saki: **${track.title}**, agla song check kar rahe hain...`);
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

            const connection = joinVoiceChannel({
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
                if (query.startsWith('http')) {
                    const info = await playdl.video_info(query).catch(() => null);
                    if (info) {
                        trackInfo = {
                            title: info.video_details.title,
                            url: info.video_details.url,
                            duration: info.video_details.durationRaw,
                            thumbnail: info.video_details.thumbnails[0]?.url
                        };
                    }
                }

                if (!trackInfo) {
                    // Search on YouTube first, fallback to SoundCloud
                    const ytSearch = await playdl.search(query, { limit: 1, source: { youtube: 'video' } }).catch(() => []);
                    if (ytSearch.length > 0) {
                        trackInfo = {
                            title: ytSearch[0].title,
                            url: ytSearch[0].url,
                            duration: ytSearch[0].durationRaw,
                            thumbnail: ytSearch[0].thumbnails[0]?.url
                        };
                    } else {
                        const scSearch = await playdl.search(query, { limit: 1, source: { soundcloud: 'tracks' } }).catch(() => []);
                        if (scSearch.length > 0) {
                            trackInfo = {
                                title: scSearch[0].name,
                                url: scSearch[0].url,
                                duration: scSearch[0].durationInSec ? `${Math.floor(scSearch[0].durationInSec / 60)}:${scSearch[0].durationInSec % 60}` : 'Unknown',
                                thumbnail: scSearch[0].thumbnail
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
                console.error(err);
                return waitMsg.edit(`❌ Playback setup error: \`${err.message}\``);
            }
        }

        // %skip, %stop, %pause, %resume, %loop
        const sQueue = serverQueues.get(message.guild.id);
        const canControl = () => isOwner || (sQueue && sQueue.hostId === message.author.id);

        if (cmd === 'skip') {
            if (!sQueue || !sQueue.isPlaying) return message.reply('❌ Koi gaana nahi chal raha.');
            if (!canControl()) return message.reply(`❌ Sirf host <@${sQueue.hostId}> skip kar sakta hai!`);
            sQueue.player.stop();
            return message.reply('⏭️ Skipped!');
        }

        if (cmd === 'stop') {
            if (!sQueue) return message.reply('❌ Bot VC me nahi hai.');
            if (!canControl()) return message.reply('❌ Sirf host ya owner stop kar sakte hain.');
            sQueue.queue = [];
            sQueue.player.stop();
            sQueue.connection?.destroy();
            serverQueues.delete(message.guild.id);
            return message.reply('⏹️ Playback stopped aur bot disconnected.');
        }

        if (cmd === 'pause') {
            if (!sQueue) return message.reply('❌ Koi song nahi chal raha.');
            if (!canControl()) return message.reply('❌ Control denied.');
            sQueue.player.pause();
            return message.reply('⏸️ Paused.');
        }

        if (cmd === 'resume') {
            if (!sQueue) return message.reply('❌ Koi song nahi chal raha.');
            if (!canControl()) return message.reply('❌ Control denied.');
            sQueue.player.unpause();
            return message.reply('▶️ Resumed.');
        }

        if (cmd === 'loop') {
            if (!sQueue) return message.reply('❌ Koi playback active nahi hai.');
            if (!canControl()) return message.reply('❌ Control denied.');
            sQueue.loop = !sQueue.loop;
            return message.reply(`🔁 Loop: **${sQueue.loop ? 'ON' : 'OFF'}**`);
        }
    });

    // Buttons
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isButton() || !interaction.customId.startsWith('m_')) return;
        const sQueue = serverQueues.get(interaction.guild.id);
        if (!sQueue || !sQueue.isPlaying) return interaction.reply({ content: '❌ Playback inactive hai.', ephemeral: true });

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
                    
