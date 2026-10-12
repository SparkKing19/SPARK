const { Player } = require('discord-player');
const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle 
} = require('discord.js');
const playdl = require('play-dl');
const ModerationConfig = require('../models/moderation');
const MusicConfig = require('../models/musicConfig');

// Permanent Bot Owners
const BOT_OWNERS = ['1266728371719508062', '1474216218792558735'];

// In-Memory Host Session Tracker: guildId -> { hostId, voiceChannelId }
const activeSessions = new Map();

async function checkIsOwner(guild, userId) {
    if (BOT_OWNERS.includes(userId)) return true;
    if (guild.ownerId === userId) return true;

    const modConfig = await ModerationConfig.findOne({ guildId: guild.id });
    if (modConfig?.extraOwners && modConfig.extraOwners.includes(userId)) return true;

    return false;
}

module.exports = async (client) => {
    const player = new Player(client, {
        ytdlOptions: {
            quality: 'highestaudio',
            highWaterMark: 1 << 25
        }
    });

    await player.extractors.loadDefault().catch(() => {});

    // Auto reconnect to 24/7 Always Channels on bot start
    client.once('ready', async () => {
        const configs = await MusicConfig.find({ isAlwaysOn: true });
        for (const cfg of configs) {
            const guild = client.guilds.cache.get(cfg.guildId);
            if (!guild) continue;
            const channel = guild.channels.cache.get(cfg.alwaysChannelId);
            if (!channel) continue;

            try {
                const queue = player.nodes.create(guild, {
                    metadata: { channel: guild.systemChannel },
                    leaveOnEmpty: false,
                    leaveOnEnd: false,
                    volume: 80
                });
                if (!queue.connection) await queue.connect(channel);
            } catch (_) {}
        }
    });

    // Voice State Update: Session release
    client.on('voiceStateUpdate', (oldState, newState) => {
        const guildId = oldState.guild.id;
        const session = activeSessions.get(guildId);
        if (!session) return;

        if (oldState.id === session.hostId && oldState.channelId !== newState.channelId) {
            activeSessions.delete(guildId);
        }
    });

    // Player Events
    player.events.on('playerStart', (queue, track) => {
        const session = activeSessions.get(queue.guild.id);
        const hostTag = session ? `<@${session.hostId}>` : `${track.requestedBy}`;

        const embed = new EmbedBuilder()
            .setColor('#2ECC71')
            .setTitle('🎶 Now Playing')
            .setDescription(`**[${track.title}](${track.url})**`)
            .addFields(
                { name: 'Duration', value: `\`${track.duration}\``, inline: true },
                { name: 'Host / Controller', value: hostTag, inline: true },
                { name: 'Voice Channel', value: `${queue.channel?.name}`, inline: true }
            )
            .setThumbnail(track.thumbnail || null)
            .setFooter({ text: '🔒 Session Locked: Sirf Host aur Owners control kar sakte hain!' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('music_pause_resume')
                .setLabel('Pause / Resume')
                .setEmoji('⏯️')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('music_skip')
                .setLabel('Skip')
                .setEmoji('⏭️')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('music_stop')
                .setLabel('Stop')
                .setEmoji('⏹️')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('music_loop')
                .setLabel('Loop')
                .setEmoji('🔁')
                .setStyle(ButtonStyle.Secondary)
        );

        queue.metadata?.channel?.send({ embeds: [embed], components: [row] }).catch(() => {});
    });

    player.events.on('emptyChannel', async (queue) => {
        const cfg = await MusicConfig.findOne({ guildId: queue.guild.id });
        if (cfg?.isAlwaysOn && cfg.alwaysChannelId === queue.channel?.id) {
            return;
        }
        activeSessions.delete(queue.guild.id);
        queue.metadata?.channel?.send('🚪 VC khali hone par playback stop ho gaya.').catch(() => {});
    });

    player.events.on('playerError', (queue, error) => {
        console.error('Audio Stream Error:', error);
        queue.metadata?.channel?.send(`⚠️ Stream playback issue: \`${error.message}\``).catch(() => {});
    });

    player.events.on('error', (queue, error) => {
        console.error('General Queue Error:', error);
    });

    // Commands Engine
    client.on('messageCreate', async (message) => {
        if (message.author.bot || !message.guild || !message.content.startsWith('%')) return;

        const args = message.content.slice(1).trim().split(/ +/);
        const cmd = args.shift()?.toLowerCase();

        const isOwner = await checkIsOwner(message.guild, message.author.id);

        // 1. %join & %join always
        if (cmd === 'join') {
            if (!isOwner) {
                return message.reply('❌ Sirf **Bot Owner, Server Owner ya Extra Owner** hi `%join` use kar sakte hain.');
            }

            const voiceChannel = message.member?.voice?.channel;
            if (!voiceChannel) {
                return message.reply('❌ Pehle kisi Voice Channel me join karo!');
            }

            const sub = args[0]?.toLowerCase();
            let mConfig = await MusicConfig.findOne({ guildId: message.guild.id }) || new MusicConfig({ guildId: message.guild.id });

            if (sub === 'always') {
                if (mConfig.isAlwaysOn && mConfig.alwaysChannelId === voiceChannel.id) {
                    mConfig.isAlwaysOn = false;
                    mConfig.alwaysChannelId = null;
                    await mConfig.save();
                    return message.reply(`🔓 <#${voiceChannel.id}> se **Always-On (24/7)** mode remove kar diya gaya.`);
                } else {
                    mConfig.isAlwaysOn = true;
                    mConfig.alwaysChannelId = voiceChannel.id;
                    await mConfig.save();

                    const queue = player.nodes.create(message.guild, {
                        metadata: { channel: message.channel },
                        leaveOnEmpty: false,
                        leaveOnEnd: false,
                        volume: 80
                    });

                    if (!queue.connection) await queue.connect(voiceChannel);

                    return message.reply(`🔒 <#${voiceChannel.id}> ab **Always-On (24/7 Music Channel)** set ho gaya hai! Bot leave nahi karega.`);
                }
            }

            const queue = player.nodes.create(message.guild, {
                metadata: { channel: message.channel },
                leaveOnEmpty: true,
                leaveOnEmptyCooldown: 30000,
                leaveOnEnd: false,
                volume: 80
            });

            if (!queue.connection) await queue.connect(voiceChannel);
            return message.reply(`✅ Connected to **${voiceChannel.name}**!`);
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
            if (!query) return message.reply('ℹ️ **Usage:** `%play <song title ya link>`');

            const voiceChannel = message.member?.voice?.channel;
            if (!voiceChannel) {
                return message.reply('❌ Pehle kisi Voice Channel me join karo!');
            }

            const session = activeSessions.get(message.guild.id);
            if (session && session.hostId !== message.author.id && !isOwner) {
                const currentHostInVC = voiceChannel.members.has(session.hostId);
                if (currentHostInVC) {
                    return message.reply(`⚠️ Music abhi <@${session.hostId}> ke control me hai!`);
                }
            }

            const waitMsg = await message.reply('🔍 Searching audio stream...');

            try {
                let searchResult = await player.search(query, { requestedBy: message.author }).catch(() => null);

                if (!searchResult || !searchResult.tracks.length) {
                    searchResult = await player.search(`soundcloud:search:${query}`, { requestedBy: message.author }).catch(() => null);
                }

                if (!searchResult || !searchResult.tracks.length) {
                    return waitMsg.edit('❌ Koi song match nahi hua.');
                }

                const mConfig = await MusicConfig.findOne({ guildId: message.guild.id });
                const is24_7 = mConfig?.isAlwaysOn && mConfig.alwaysChannelId === voiceChannel.id;

                const { track } = await player.play(voiceChannel, searchResult, {
                    nodeOptions: {
                        metadata: { channel: message.channel },
                        volume: 80,
                        leaveOnEmpty: !is24_7,
                        leaveOnEmptyCooldown: 30000,
                        leaveOnEnd: false,
                        bufferingTimeout: 15000,
                        // Stream Bridge to avoid quiet / frozen audio
                        async onBeforeCreateStream(t, source) {
                            if (source === 'youtube' || t.url.includes('youtube.com') || t.url.includes('youtu.be')) {
                                try {
                                    const stream = await playdl.stream(t.url, { discordPlayerCompatibility: true });
                                    return stream.stream;
                                } catch (_) {}
                            }
                            return null;
                        }
                    }
                });

                if (!activeSessions.has(message.guild.id)) {
                    activeSessions.set(message.guild.id, {
                        hostId: message.author.id,
                        voiceChannelId: voiceChannel.id
                    });
                }

                return waitMsg.edit(`✅ Added to queue: **${track.title}** (\`${track.duration}\`)\n🔒 **Session Host:** <@${message.author.id}>`);
            } catch (err) {
                console.error('Play error:', err);
                return waitMsg.edit(`❌ Playback error: \`${err.message}\``);
            }
        }

        // 3. %skip
        if (cmd === 'skip' || cmd === 'next') {
            if (!canControl()) {
                const session = activeSessions.get(message.guild.id);
                return message.reply(`❌ Sirf Host (<@${session.hostId}>) skip kar sakta hai!`);
            }

            const queue = player.nodes.get(message.guild.id);
            if (!queue || !queue.isPlaying()) return message.reply('❌ Koi song play nahi ho raha.');
            queue.node.skip();
            return message.reply('⏭️ Song skip kar diya gaya.');
        }

        // 4. %stop / %leave
        if (cmd === 'stop' || cmd === 'leave') {
            if (!canControl()) {
                const session = activeSessions.get(message.guild.id);
                return message.reply(`❌ Sirf Host (<@${session.hostId}>) ya Owners stop kar sakte hain!`);
            }

            const queue = player.nodes.get(message.guild.id);
            if (!queue) return message.reply('❌ Bot kisi VC me nahi hai.');

            activeSessions.delete(message.guild.id);

            const mConfig = await MusicConfig.findOne({ guildId: message.guild.id });
            if (mConfig?.isAlwaysOn && mConfig.alwaysChannelId === queue.channel?.id) {
                queue.tracks.clear();
                queue.node.stop();
                return message.reply('⏹️ Music stopped (Always-On active).');
            } else {
                queue.delete();
                return message.reply('⏹️ Music stopped and bot left VC.');
            }
        }

        // 5. %pause / %resume
        if (cmd === 'pause' || cmd === 'resume') {
            if (!canControl()) {
                const session = activeSessions.get(message.guild.id);
                return message.reply(`❌ Sirf Host (<@${session.hostId}>) ya Owners control kar sakte hain!`);
            }

            const queue = player.nodes.get(message.guild.id);
            if (!queue || !queue.isPlaying()) return message.reply('❌ Koi song active nahi hai.');
            if (queue.node.isPaused()) {
                queue.node.resume();
                return message.reply('▶️ Resumed.');
            } else {
                queue.node.pause();
                return message.reply('⏸️ Paused.');
            }
        }

        // 6. %queue
        if (cmd === 'queue' || cmd === 'q') {
            const queue = player.nodes.get(message.guild.id);
            if (!queue || !queue.isPlaying()) return message.reply('❌ Queue empty hai.');

            const current = queue.currentTrack;
            const tracks = queue.tracks.toArray().slice(0, 10);
            const list = tracks.map((t, idx) => `**${idx + 1}.** [${t.title}](${t.url}) - \`${t.duration}\``).join('\n');
            const session = activeSessions.get(message.guild.id);

            const embed = new EmbedBuilder()
                .setColor('#3498DB')
                .setTitle(`🎶 Server Queue - ${message.guild.name}`)
                .setDescription(
                    `**Now Playing:**\n[${current.title}](${current.url})\n\n` +
                    `**Current Host:** ${session ? `<@${session.hostId}>` : 'None'}\n\n` +
                    `**Up Next:**\n${list || '*No upcoming tracks*'}`
                );

            return message.reply({ embeds: [embed] });
        }

        // 7. %loop
        if (cmd === 'loop') {
            if (!canControl()) {
                const session = activeSessions.get(message.guild.id);
                return message.reply(`❌ Sirf Host (<@${session.hostId}>) ya Owners loop switch kar sakte hain!`);
            }

            const queue = player.nodes.get(message.guild.id);
            if (!queue || !queue.isPlaying()) return message.reply('❌ Koi track play nahi ho raha.');

            const mode = queue.repeatMode === 1 ? 0 : 1;
            queue.setRepeatMode(mode);
            return message.reply(`🔁 Loop mode **${mode === 1 ? 'ENABLED' : 'DISABLED'}**.`);
        }
    });

    // Buttons Handler
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isButton() || !interaction.customId.startsWith('music_')) return;

        const queue = player.nodes.get(interaction.guild.id);
        if (!queue || !queue.isPlaying()) {
            return interaction.reply({ content: '❌ Current playback inactive hai.', ephemeral: true });
        }

        const isOwner = await checkIsOwner(interaction.guild, interaction.user.id);
        const session = activeSessions.get(interaction.guild.id);

        if (session && session.hostId !== interaction.user.id && !isOwner) {
            const hostInVC = queue.channel?.members.has(session.hostId);
            if (hostInVC) {
                return interaction.reply({ 
                    content: `⚠️ Controller locked hai! Sirf host <@${session.hostId}> ya Owners control kar sakte hain.`, 
                    ephemeral: true 
                });
            }
        }

        const action = interaction.customId.replace('music_', '');

        if (action === 'pause_resume') {
            if (queue.node.isPaused()) {
                queue.node.resume();
                return interaction.reply({ content: '▶️ Resumed.', ephemeral: true });
            } else {
                queue.node.pause();
                return interaction.reply({ content: '⏸️ Paused.', ephemeral: true });
            }
        }

        if (action === 'skip') {
            queue.node.skip();
            return interaction.reply({ content: '⏭️ Skipped.', ephemeral: true });
        }

        if (action === 'stop') {
            activeSessions.delete(interaction.guild.id);
            const mConfig = await MusicConfig.findOne({ guildId: interaction.guild.id });
            if (mConfig?.isAlwaysOn && mConfig.alwaysChannelId === queue.channel?.id) {
                queue.tracks.clear();
                queue.node.stop();
                return interaction.reply({ content: '⏹️ Stopped. (24/7 VC Active).', ephemeral: true });
            } else {
                queue.delete();
                return interaction.reply({ content: '⏹️ Stopped & Left VC.', ephemeral: true });
            }
        }

        if (action === 'loop') {
            const mode = queue.repeatMode === 1 ? 0 : 1;
            queue.setRepeatMode(mode);
            return interaction.reply({ content: `🔁 Loop set to: **${mode === 1 ? 'ON' : 'OFF'}**`, ephemeral: true });
        }
    });

    console.log('✔ Secured Music System with Session Lock & Always-Join loaded.');
};
                    
