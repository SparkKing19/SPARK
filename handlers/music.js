const { Player } = require('discord-player');
const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle 
} = require('discord.js');
const ServerSettings = require('../models/serverSettings');

module.exports = async (client) => {
    // Player instance initialize
    const player = new Player(client, {
        ytdlOptions: {
            quality: 'highestaudio',
            highWaterMark: 1 << 25
        }
    });

    // Default extractors load (YouTube, Spotify, SoundCloud etc.)
    await player.extractors.loadDefault().catch(() => {});

    // Player Events
    player.events.on('playerStart', (queue, track) => {
        const embed = new EmbedBuilder()
            .setColor('#2ECC71')
            .setTitle('🎶 Now Playing')
            .setDescription(`**[${track.title}](${track.url})**`)
            .addFields(
                { name: 'Duration', value: `\`${track.duration}\``, inline: true },
                { name: 'Requested By', value: `${track.requestedBy}`, inline: true },
                { name: 'Channel', value: `${queue.channel}`, inline: true }
            )
            .setThumbnail(track.thumbnail)
            .setFooter({ text: 'Music Player Engine' });

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

    player.events.on('emptyChannel', (queue) => {
        queue.metadata?.channel?.send('🚪 VC me koi nahi tha, isliye playback stop ho gaya.').catch(() => {});
    });

    // % Prefix Commands Engine
    client.on('messageCreate', async (message) => {
        if (message.author.bot || !message.guild || !message.content.startsWith('%')) return;

        // Check if music feature is enabled globally
        const settings = await ServerSettings.findOne({ guildId: message.guild.id });
        if (settings?.features && settings.features.music === false) return;

        const args = message.content.slice(1).trim().split(/ +/);
        const cmd = args.shift()?.toLowerCase();

        // 1. %play <song name ya link>
        if (cmd === 'play' || cmd === 'p') {
            const query = args.join(' ');
            if (!query) return message.reply('ℹ️ **Usage:** `%play <song title ya YouTube/Spotify link>`');

            const voiceChannel = message.member?.voice?.channel;
            if (!voiceChannel) {
                return message.reply('❌ Music chalane ke liye pehle kisi Voice Channel me join karo!');
            }

            const waitMsg = await message.reply('🔍 Searching track...');

            try {
                const searchResult = await player.search(query, {
                    requestedBy: message.author
                });

                if (!searchResult || !searchResult.tracks.length) {
                    return waitMsg.edit('❌ Koi song match nahi hua.');
                }

                const { track } = await player.play(voiceChannel, searchResult, {
                    nodeOptions: {
                        metadata: { channel: message.channel },
                        volume: 80,
                        leaveOnEmpty: true,
                        leaveOnEmptyCooldown: 30000,
                        leaveOnEnd: false
                    }
                });

                return waitMsg.edit(`✅ Added to queue: **${track.title}** (\`${track.duration}\`)`);
            } catch (err) {
                console.error('Music play error:', err);
                return waitMsg.edit(`❌ Play karte waqt error: \`${err.message}\``);
            }
        }

        // 2. %skip / %next
        if (cmd === 'skip' || cmd === 'next') {
            const queue = player.nodes.get(message.guild.id);
            if (!queue || !queue.isPlaying()) return message.reply('❌ Koi song play nahi ho raha.');

            queue.node.skip();
            return message.reply('⏭️ Current song skip kar diya gaya.');
        }

        // 3. %stop / %leave
        if (cmd === 'stop' || cmd === 'leave') {
            const queue = player.nodes.get(message.guild.id);
            if (!queue) return message.reply('❌ Bot kisi VC me nahi hai.');

            queue.delete();
            return message.reply('⏹️ Music band kar diya gaya aur queue clear ho gayi.');
        }

        // 4. %pause / %resume
        if (cmd === 'pause' || cmd === 'resume') {
            const queue = player.nodes.get(message.guild.id);
            if (!queue || !queue.isPlaying()) return message.reply('❌ Koi playback active nahi hai.');

            const isPaused = queue.node.isPaused();
            if (isPaused) {
                queue.node.resume();
                return message.reply('▶️ Playback resume ho gaya.');
            } else {
                queue.node.pause();
                return message.reply('⏸️ Playback pause kar diya gaya.');
            }
        }

        // 5. %queue / %q
        if (cmd === 'queue' || cmd === 'q') {
            const queue = player.nodes.get(message.guild.id);
            if (!queue || !queue.isPlaying()) return message.reply('❌ Queue abhi empty hai.');

            const currentTrack = queue.currentTrack;
            const tracks = queue.tracks.toArray().slice(0, 10);

            const queueList = tracks.map((t, idx) => `**${idx + 1}.** [${t.title}](${t.url}) - \`${t.duration}\``).join('\n');

            const embed = new EmbedBuilder()
                .setColor('#3498DB')
                .setTitle(`🎶 Server Music Queue - ${message.guild.name}`)
                .setDescription(
                    `**Now Playing:**\n[${currentTrack.title}](${currentTrack.url}) (\`${currentTrack.duration}\`)\n\n` +
                    `**Up Next:**\n${queueList || '*Koi agla track queue me nahi hai.*'}`
                )
                .setFooter({ text: `Total Tracks: ${queue.tracks.size + 1}` });

            return message.reply({ embeds: [embed] });
        }

        // 6. %nowplaying / %np
        if (cmd === 'nowplaying' || cmd === 'np') {
            const queue = player.nodes.get(message.guild.id);
            if (!queue || !queue.isPlaying()) return message.reply('❌ Koi track play nahi ho raha.');

            const track = queue.currentTrack;
            const progress = queue.node.createProgressBar();

            const embed = new EmbedBuilder()
                .setColor('#2ECC71')
                .setTitle('🎵 Currently Playing')
                .setDescription(`**[${track.title}](${track.url})**\n\n${progress}`)
                .setThumbnail(track.thumbnail)
                .addFields(
                    { name: 'Duration', value: `\`${track.duration}\``, inline: true },
                    { name: 'Requested By', value: `${track.requestedBy}`, inline: true }
                );

            return message.reply({ embeds: [embed] });
        }

        // 7. %loop
        if (cmd === 'loop') {
            const queue = player.nodes.get(message.guild.id);
            if (!queue || !queue.isPlaying()) return message.reply('❌ Koi track play nahi ho raha.');

            const mode = queue.repeatMode === 1 ? 0 : 1; // 1 = Track loop, 0 = Off
            queue.setRepeatMode(mode);

            return message.reply(`🔁 Loop mode **${mode === 1 ? 'ENABLED' : 'DISABLED'}** kar diya gaya.`);
        }
    });

    // Music Interactive Buttons Handler
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isButton() || !interaction.customId.startsWith('music_')) return;

        const queue = player.nodes.get(interaction.guild.id);
        if (!queue || !queue.isPlaying()) {
            return interaction.reply({ content: '❌ Current queue inactive ho chuki hai.', ephemeral: true });
        }

        if (interaction.member?.voice?.channel?.id !== queue.channel?.id) {
            return interaction.reply({ content: '❌ Controller use karne ke liye usi VC me hona zaroori hai jisme bot hai!', ephemeral: true });
        }

        const action = interaction.customId.replace('music_', '');

        if (action === 'pause_resume') {
            const isPaused = queue.node.isPaused();
            if (isPaused) {
                queue.node.resume();
                return interaction.reply({ content: '▶️ Resumed track.', ephemeral: true });
            } else {
                queue.node.pause();
                return interaction.reply({ content: '⏸️ Paused track.', ephemeral: true });
            }
        }

        if (action === 'skip') {
            queue.node.skip();
            return interaction.reply({ content: '⏭️ Track skipped.', ephemeral: true });
        }

        if (action === 'stop') {
            queue.delete();
            return interaction.reply({ content: '⏹️ Playback stopped and bot left VC.', ephemeral: true });
        }

        if (action === 'loop') {
            const mode = queue.repeatMode === 1 ? 0 : 1;
            queue.setRepeatMode(mode);
            return interaction.reply({ content: `🔁 Loop set to: **${mode === 1 ? 'ON' : 'OFF'}**`, ephemeral: true });
        }
    });

    console.log('✔ Music System Handler loaded.');
};
