const { Player } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = async (client) => {
    // Player instance initialize
    const player = new Player(client, {
        ytdlOptions: {
            quality: 'highestaudio',
            highWaterMark: 1 << 25
        }
    });

    // Default extractors load (YouTube, Spotify, SoundCloud, etc.)
    await player.extractors.loadMulti(DefaultExtractors);
    client.player = player;

    // Track Start Event -> Interactive Rythm-style Controller
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
            .setFooter({ text: `Volume: ${queue.node.volume}\% \vert{} Loop:${queue.repeatMode ? 'ON' : 'OFF'}` })
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

        queue.metadata.channel.send({ embeds: [embed], components: [row] }).catch(() => {});
    });

    player.events.on('emptyChannel', (queue) => {
        queue.metadata.channel.send('👋 Voice channel khaali ho gaya, leaving to save resources.').catch(() => {});
    });

    player.events.on('emptyQueue', (queue) => {
        queue.metadata.channel.send('✅ Queue khatam ho gayi!').catch(() => {});
    });

    player.events.on('error', (queue, error) => {
        console.error(`Music Player Error: ${error.message}`);
    });

    // Controller Buttons Interaction Handler
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
                return interaction.reply({ content: '▶️ Music resume kar diya gaya.', ephemeral: true });
            } else {
                queue.node.pause();
                return interaction.reply({ content: '⏸️ Music pause kar diya gaya.', ephemeral: true });
            }
        }

        if (interaction.customId === 'music_skip') {
            queue.node.skip();
            return interaction.reply({ content: '⏭️ Current track skip kar diya gaya.', ephemeral: true });
        }

        if (interaction.customId === 'music_loop') {
            const nextMode = queue.repeatMode === 0 ? 1 : 0;
            queue.setRepeatMode(nextMode);
            return interaction.reply({ content: `🔁 Track loop ab **${nextMode === 1 ? 'Enabled' : 'Disabled'}** hai.`, ephemeral: true });
        }

        if (interaction.customId === 'music_stop') {
            queue.delete();
            return interaction.reply({ content: '⏹️ Music band karke queue clear kar di gayi.', ephemeral: true });
        }
    });

    console.log('✔ Rythm Music Engine Loaded Successfully.');
};
