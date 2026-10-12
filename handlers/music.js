const { Shoukaku, Connectors } = require('shoukaku');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ModerationConfig = require('../models/moderation');
const MusicConfig = require('../models/musicConfig');

const BOT_OWNERS = ['1266728371719508062', '1474216218792558735'];

// Reliable Public Lavalink v4 Nodes
const Nodes = [
    {
        name: 'AjieDev-Lavalink',
        url: 'lava-v4.ajieblogs.eu.org:80',
        auth: 'https://dsc.gg/ajidevserver',
        secure: false
    },
    {
        name: 'Lavalink-Public-Node',
        url: 'lavalink.serenetia.com:443',
        auth: 'youshallnotpass',
        secure: true
    }
];

// In-Memory Trackers
const activeSessions = new Map(); // guildId -> { hostId, voiceChannelId }
const serverQueues = new Map();   // guildId -> { queue: [], current: null, player: null, textChannel: null, loop: false }

async function checkIsOwner(guild, userId) {
    if (BOT_OWNERS.includes(userId)) return true;
    if (guild.ownerId === userId) return true;
    const modConfig = await ModerationConfig.findOne({ guildId: guild.id });
    if (modConfig?.extraOwners && modConfig.extraOwners.includes(userId)) return true;
    return false;
}

module.exports = async (client) => {
    // 1. Initialize Lavalink (Shoukaku)
    const shoukaku = new Shoukaku(new Connectors.DiscordJS(client), Nodes, {
        moveOnDisconnect: true,
        resume: false,
        reconnectTries: 5,
        restTimeout: 10000
    });

    client.shoukaku = shoukaku;

    shoukaku.on('ready', (name) => console.log(`✔ Lavalink Node Connected: [${name}]`));
    shoukaku.on('error', (name, error) => console.error(`✖ Lavalink Node Error [${name}]:`, error));
    shoukaku.on('close', (name, code, reason) => console.warn(`! Lavalink Closed [${name}]: Code ${code}, Reason:${reason}`));

    // Function: Play next track in queue
    async function playTrack(guildId) {
        const sData = serverQueues.get(guildId);
        if (!sData) return;

        if (sData.queue.length === 0) {
            sData.current = null;
            const mConfig = await MusicConfig.findOne({ guildId });
            if (!mConfig?.isAlwaysOn) {
                setTimeout(async () => {
                    const check = serverQueues.get(guildId);
                    if (check && check.queue.length === 0 && !check.current) {
                        await client.shoukaku.leaveVoiceChannel(guildId).catch(() => {});
                        serverQueues.delete(guildId);
                        activeSessions.delete(guildId);
                    }
                }, 60000);
            }
            return;
        }

        const track = sData.loop && sData.current ? sData.current : sData.queue.shift();
        sData.current = track;

        await sData.player.playTrack({ track: track.encoded });

        const session = activeSessions.get(guildId);
        const durationSec = Math.floor(track.info.length / 1000);
        const durationStr = `${Math.floor(durationSec / 60)}:${(durationSec % 60).toString().padStart(2, '0')}`;

        const embed = new EmbedBuilder()
            .setColor('#2ECC71')
            .setTitle('🎶 Now Playing')
            .setDescription(`**[${track.info.title}](${track.info.uri})**`)
            .addFields(
                { name: 'Duration', value: `\`${durationStr}\``, inline: true },
                { name: 'Author', value: `${track.info.author}`, inline: true },
                { name: 'Host / Controller', value: session ? `<@${session.hostId}>` : 'None', inline: true }
            )
            .setThumbnail(track.info.artworkUrl || null)
            .setFooter({ text: '⚡ Lavalink High-Performance Audio Engine' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('lav_pause_resume').setLabel('Pause / Resume').setEmoji('⏯️').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('lav_skip').setLabel('Skip').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('lav_stop').setLabel('Stop').setEmoji('⏹️').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('lav_loop').setLabel('Loop').setEmoji('🔁').setStyle(ButtonStyle.Secondary)
        );

        sData.textChannel?.send({ embeds: [embed], components: [row] }).catch(() => {});
    }

    // Voice State Update: Release Session Lock
    client.on('voiceStateUpdate', (oldState, newState) => {
        const guildId = oldState.guild.id;
        const session = activeSessions.get(guildId);
        if (!session) return;

        if (oldState.id === session.hostId && oldState.channelId !== newState.channelId) {
            activeSessions.delete(guildId);
        }
    });

    // Message Command Engine
    client.on('messageCreate', async (message) => {
        if (message.author.bot || !message.guild || !message.content.startsWith('%')) return;

        const args = message.content.slice(1).trim().split(/ +/);
        const cmd = args.shift()?.toLowerCase();
        const isOwner = await checkIsOwner(message.guild, message.author.id);

        // 1. %join & %join always
        if (cmd === 'join') {
            if (!isOwner) return message.reply('❌ Sirf Bot Owner, Server Owner ya Extra Owner hi `%join` use kar sakte hain.');
            const vc = message.member?.voice?.channel;
            if (!vc) return message.reply('❌ Pehle kisi Voice Channel me join karo!');

            const sub = args[0]?.toLowerCase();
            let mConfig = await MusicConfig.findOne({ guildId: message.guild.id }) || new MusicConfig({ guildId: message.guild.id });

            if (sub === 'always') {
                if (mConfig.isAlwaysOn && mConfig.alwaysChannelId === vc.id) {
                    mConfig.isAlwaysOn = false;
                    mConfig.alwaysChannelId = null;
                    await mConfig.save();
                    return message.reply(`🔓 <#${vc.id}> se **Always-On** mode disable kar diya gaya.`);
                } else {
                    mConfig.isAlwaysOn = true;
                    mConfig.alwaysChannelId = vc.id;
                    await mConfig.save();
                }
            }

            await client.shoukaku.joinVoiceChannel({
                guildId: message.guild.id,
                channelId: vc.id,
                shardId: 0,
                deaf: true
            }).catch(() => {});

            return message.reply(`✅ Connected to **${vc.name}**!`);
        }

        const canControl = () => {
            if (isOwner) return true;
            const session = activeSessions.get(message.guild.id);
            if (!session) return true;
            return session.hostId === message.author.id;
        };

        // 2. %play
        if (cmd === 'play' || cmd === 'p') {
            const query = args.join(' ');
            if (!query) return message.reply('ℹ️ **Usage:** `%play <song name ya link>`');

            const vc = message.member?.voice?.channel;
            if (!vc) return message.reply('❌ Pehle kisi Voice Channel me join karo!');

            const session = activeSessions.get(message.guild.id);
            if (session && session.hostId !== message.author.id && !isOwner) {
                if (vc.members.has(session.hostId)) {
                    return message.reply(`⚠️ Music abhi <@${session.hostId}> ke control me hai!`);
                }
            }

            const node = shoukaku.options.nodeResolver(shoukaku.nodes);
            if (!node) return message.reply('❌ Lavalink Audio Node abhi connect nahi hua hai, ek second wait karo.');

            const waitMsg = await message.reply('🔍 Lavalink engine par track fetch ho raha hai...');

            try {
                const isUrl = query.startsWith('http://') || query.startsWith('https://');
                const searchIdentifier = isUrl ? query : `ytmsearch:${query}`;

                let result = await node.rest.resolve(searchIdentifier);
                if (!result || !result.data || (Array.isArray(result.data) && result.data.length === 0)) {
                    result = await node.rest.resolve(`scsearch:${query}`);
                }

                if (!result || !result.data || (Array.isArray(result.data) && result.data.length === 0)) {
                    return waitMsg.edit('❌ Koi song match nahi hua.');
                }

                let sData = serverQueues.get(message.guild.id);
                if (!sData) {
                    const player = await client.shoukaku.joinVoiceChannel({
                        guildId: message.guild.id,
                        channelId: vc.id,
                        shardId: 0,
                        deaf: true
                    });

                    player.on('end', () => playTrack(message.guild.id));
                    player.on('exception', (err) => {
                        console.error('Lavalink Playback Exception:', err);
                        playTrack(message.guild.id);
                    });

                    sData = {
                        player,
                        queue: [],
                        current: null,
                        textChannel: message.channel,
                        loop: false
                    };
                    serverQueues.set(message.guild.id, sData);
                }

                sData.textChannel = message.channel;

                let addedTrack = null;
                if (result.loadType === 'playlist') {
                    sData.queue.push(...result.data.tracks);
                    addedTrack = result.data.tracks[0];
                    await waitMsg.edit(`✅ Added Playlist: **${result.data.info.name}** (\`${result.data.tracks.length} tracks\`)`);
                } else {
                    const track = Array.isArray(result.data) ? result.data[0] : result.data;
                    sData.queue.push(track);
                    addedTrack = track;
                    await waitMsg.edit(`✅ Added to queue: **${track.info.title}**\n🔒 **Host:** <@${message.author.id}>`);
                }

                if (!activeSessions.has(message.guild.id)) {
                    activeSessions.set(message.guild.id, {
                        hostId: message.author.id,
                        voiceChannelId: vc.id
                    });
                }

                if (!sData.current) {
                    await playTrack(message.guild.id);
                }
            } catch (err) {
                console.error('Lavalink play command error:', err);
                return waitMsg.edit(`❌ Playback error: \`${err.message}\``);
            }
        }

        // 3. %skip
        if (cmd === 'skip' || cmd === 'next') {
            const sData = serverQueues.get(message.guild.id);
            if (!sData || !sData.current) return message.reply('❌ Koi song play nahi ho raha.');
            if (!canControl()) return message.reply('❌ Sirf Session Host ya Owner skip kar sakte hain!');

            await sData.player.stopTrack();
            return message.reply('⏭️ Track skipped!');
        }

        // 4. %stop
        if (cmd === 'stop' || cmd === 'leave') {
            const sData = serverQueues.get(message.guild.id);
            if (!sData) return message.reply('❌ Bot VC me nahi hai.');
            if (!canControl()) return message.reply('❌ Control denied.');

            sData.queue = [];
            sData.current = null;
            await sData.player.stopTrack();

            const mConfig = await MusicConfig.findOne({ guildId: message.guild.id });
            if (!mConfig?.isAlwaysOn) {
                await client.shoukaku.leaveVoiceChannel(message.guild.id).catch(() => {});
                serverQueues.delete(message.guild.id);
            }
            activeSessions.delete(message.guild.id);
            return message.reply('⏹️ Playback stopped.');
        }

        // 5. %pause / %resume
        if (cmd === 'pause' || cmd === 'resume') {
            const sData = serverQueues.get(message.guild.id);
            if (!sData || !sData.current) return message.reply('❌ Koi track active nahi hai.');
            if (!canControl()) return message.reply('❌ Control denied.');

            const isPaused = sData.player.paused;
            await sData.player.setPaused(!isPaused);
            return message.reply(isPaused ? '▶️ Resumed.' : '⏸️ Paused.');
        }

        // 6. %loop
        if (cmd === 'loop') {
            const sData = serverQueues.get(message.guild.id);
            if (!sData || !sData.current) return message.reply('❌ Koi track play nahi ho raha.');
            if (!canControl()) return message.reply('❌ Control denied.');

            sData.loop = !sData.loop;
            return message.reply(`🔁 Loop: **${sData.loop ? 'ON' : 'OFF'}**`);
        }
    });

    // Button Controller
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isButton() || !interaction.customId.startsWith('lav_')) return;

        const sData = serverQueues.get(interaction.guild.id);
        if (!sData || !sData.current) {
            return interaction.reply({ content: '❌ Playback inactive hai.', ephemeral: true });
        }

        const isOwner = await checkIsOwner(interaction.guild, interaction.user.id);
        const session = activeSessions.get(interaction.guild.id);

        if (session && session.hostId !== interaction.user.id && !isOwner) {
            return interaction.reply({ content: `⚠️ Controller locked hai host <@${session.hostId}> ke paas!`, ephemeral: true });
        }

        const action = interaction.customId.replace('lav_', '');

        if (action === 'pause_resume') {
            const isPaused = sData.player.paused;
            await sData.player.setPaused(!isPaused);
            return interaction.reply({ content: isPaused ? '▶️ Resumed.' : '⏸️ Paused.', ephemeral: true });
        }
        if (action === 'skip') {
            await sData.player.stopTrack();
            return interaction.reply({ content: '⏭️ Skipped.', ephemeral: true });
        }
        if (action === 'stop') {
            sData.queue = [];
            sData.current = null;
            await sData.player.stopTrack();
            activeSessions.delete(interaction.guild.id);
            return interaction.reply({ content: '⏹️ Stopped.', ephemeral: true });
        }
        if (action === 'loop') {
            sData.loop = !sData.loop;
            return interaction.reply({ content: `🔁 Loop set to: **${sData.loop ? 'ON' : 'OFF'}**`, ephemeral: true });
        }
    });
};
                                                
