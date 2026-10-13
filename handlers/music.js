const { Player } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');
const { YoutubeiExtractor } = require('discord-player-youtubei');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Music247 = require('../models/music247');

module.exports = async (client) => {
    const player = new Player(client, {
        ytdlOptions: {
            quality: 'highestaudio',
            highWaterMark: 1 << 25
        }
    });

    // 1. YouTube Innertube Extractor load (Bypasses Datacenter IP blocking)
    await player.extractors.register(YoutubeiExtractor, {});

    // 2. Default extractors load (Spotify, SoundCloud, etc.)
    await player.extractors.loadDefault();
    client.player = player;

    // Track Start Event -> Rythm-style Controller
    player.events.on('playerStart', (queue, track) => {
        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('🎶 Now Playing')
            .setDescription(`[**${track.title}**](${track.url})`)
            .addFields(
                { name: 'Duration', value: `\`${track.duration}\``, inline: true },
                { name: 'Requested By', value: `${track.requestedBy}`, inline: true },
                { name: 'Channel', value: `<#${queue.channel.id}>`, inline: true }
            )
            .setThumbnail(track.thumbnail || client.user.displayAvatarURL())
            .setFooter({ text: `Volume: ${queue.node.volume}% | Loop: ${queue.repeatMode ? 'ON' : 'OFF'}` })
            .setTimestamp();

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
                .setCustomId('music_loop')
                .setLabel('Loop')
                .setEmoji('🔁')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('music_stop')
                .setLabel('Stop')
                .setEmoji('⏹️')
                .setStyle(ButtonStyle.Danger)
        );

        queue.metadata?.channel?.send({ embeds: [embed], components: [row] }).catch(() => {});
    });

    // Empty Channel check (24/7 protected)
    player.events.on('emptyChannel', async (queue) => {
        const is247 = await Music247.findOne({ guildId: queue.guild.id, enabled: true }).catch(() => null);
        if (is247) return;

        queue.metadata?.channel?.send('👋 Voice channel khaali ho gaya, leaving to save resources.').catch(() => {});
    });

    // Empty Queue check (24/7 protected)
    player.events.on('emptyQueue', async (queue) => {
        const is247 = await Music247.findOne({ guildId: queue.guild.id, enabled: true }).catch(() => null);
        if (!is247) {
            queue.metadata?.channel?.send('✅ Queue khatam ho gayi!').catch(() => {});
        }
    });

    player.events.on('error', (queue, error) => {
        console.error(`Music Player Error: ${error.message}`);
    });

    // Auto Reconnect to 24/7 channels on Bot Ready
    client.once('ready', async () => {
        const records = await Music247.find({ enabled: true }).catch(() => []);
        for (const rec of records) {
            const guild = client.guilds.cache.get(rec.guildId);
            if (!guild) continue;

            const voiceChannel = guild.channels.cache.get(rec.voiceChannelId);
            if (!voiceChannel) continue;

            let queue = player.nodes.get(guild.id);
            if (!queue) {
                queue = player.nodes.create(guild, {
                    metadata: { channel: guild.channels.cache.get(rec.textChannelId) },
                    volume: 80,
                    leaveOnEmpty: false,
                    leaveOnEnd: false
                });
            }

            try {
                if (!queue.connection) await queue.connect(voiceChannel);
            } catch (e) {
                console.error(`Failed to reconnect 24/7 in ${guild.name}:`, e.message);
            }
        }
    });

    // Controller Buttons
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isButton() || !interaction.customId.startsWith('music_')) return;

        const queue = player.nodes.get(interaction.guildId);
        if (!queue || !queue.isPlaying()) {
            return interaction.reply({ content: '❌ Abhi koi gaana play nahi ho raha hai.', ephemeral: true });
        }

        if (!interaction.member.voice.channel || interaction.member.voice.channel.id !== queue.channel.id) {
            return interaction.reply({ content: '❌ Controller use karne ke liye usi voice channel me hona zaroori hai!', ephemeral: true });
        }

        if (interaction.customId === 'music_pause_resume') {
            const isPaused = queue.node.isPaused();
            if (isPaused) {
                queue.node.resume();
                return interaction.reply({ content: '▶️ Music resume ho gaya.', ephemeral: true });
            } else {
                queue.node.pause();
                return interaction.reply({ content: '⏸️ Music pause ho gaya.', ephemeral: true });
            }
        }

        if (interaction.customId === 'music_skip') {
            queue.node.skip();
            return interaction.reply({ content: '⏭️ Current track skip ho gaya.', ephemeral: true });
        }

        if (interaction.customId === 'music_loop') {
            const nextMode = queue.repeatMode === 0 ? 1 : 0;
            queue.setRepeatMode(nextMode);
            return interaction.reply({ content: `🔁 Loop mode ab **${nextMode === 1 ? 'Enabled' : 'Disabled'}** hai.`, ephemeral: true });
        }

        if (interaction.customId === 'music_stop') {
            const is247 = await Music247.findOne({ guildId: interaction.guildId, enabled: true }).catch(() => null);
            queue.tracks.clear();
            queue.node.stop();

            if (!is247) {
                queue.delete();
                return interaction.reply({ content: '⏹️ Music stopped and disconnected.', ephemeral: true });
            }
            return interaction.reply({ content: '⏹️ Music stopped and queue cleared (24/7 mode active).', ephemeral: true });
        }
    });

    console.log('✔ Rythm Music Engine & 24/7 System Active.');
};
