const { Poru } = require('poru');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Music247 = require('../models/music247');

module.exports = async (client) => {
    // Exact wahi node jis par gaana play hua tha
    const nodes = [
        {
            name: 'Lavalink-V4-Main',
            host: 'lava-v4.ajieblogs.eu.org',
            port: 443,
            password: 'https://dsc.gg/ajidevserver',
            secure: true
        }
    ];

    const poru = new Poru(client, nodes, {
        library: 'discord.js',
        defaultPlatform: 'ytsearch'
    });

    client.poru = poru;

    poru.on('nodeConnect', (node) => {
        console.log(`✔ Lavalink Node Connected: ${node.name}`);
    });

    poru.on('nodeError', (node, error) => {
        // Silent error taaki crash na kare
    });

    poru.on('nodeDisconnect', (node) => {});

    // Track Start Event (Rythm Controller)
    poru.on('trackStart', (player, track) => {
        const channel = client.channels.cache.get(player.textChannel);
        if (!channel) return;

        const duration = track.info.isStream 
            ? 'LIVE' 
            : new Date(track.info.length).toISOString().substr(14, 5);

        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('🎶 Now Playing')
            .setDescription(`[**${track.info.title}**](${track.info.uri})`)
            .addFields(
                { name: 'Duration', value: `\`${duration}\``, inline: true },
                { name: 'Author', value: `${track.info.author}`, inline: true },
                { name: 'Channel', value: `<#${player.voiceChannel}>`, inline: true }
            )
            .setThumbnail(track.info.image || client.user.displayAvatarURL())
            .setFooter({ text: `Volume: ${player.volume}% | Engine: Lavalink v4` })
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

        channel.send({ embeds: [embed], components: [row] }).catch(() => {});
    });

    // Queue End
    poru.on('queueEnd', async (player) => {
        const is247 = await Music247.findOne({ guildId: player.guildId, enabled: true }).catch(() => null);
        const channel = client.channels.cache.get(player.textChannel);

        if (!is247) {
            if (channel) channel.send('✅ Queue khatam ho gayi, leaving channel.').catch(() => {});
            player.destroy();
        } else {
            if (channel) channel.send('✅ Queue khatam ho gayi! (24/7 mode active)').catch(() => {});
        }
    });

    client.once('ready', () => {
        poru.init(client);
    });

    // Controller Buttons
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isButton() || !interaction.customId.startsWith('music_')) return;

        const player = poru.players.get(interaction.guildId);
        if (!player || !player.currentTrack) {
            return interaction.reply({ content: '❌ Abhi koi gaana play nahi ho raha hai.', ephemeral: true });
        }

        if (!interaction.member.voice.channel || interaction.member.voice.channel.id !== player.voiceChannel) {
            return interaction.reply({ content: '❌ Controller use karne ke liye usi voice channel me hona zaroori hai!', ephemeral: true });
        }

        if (interaction.customId === 'music_pause_resume') {
            if (player.isPaused) {
                player.pause(false);
                return interaction.reply({ content: '▶️ Music resume ho gaya.', ephemeral: true });
            } else {
                player.pause(true);
                return interaction.reply({ content: '⏸️ Music pause ho gaya.', ephemeral: true });
            }
        }

        if (interaction.customId === 'music_skip') {
            player.stop();
            return interaction.reply({ content: '⏭️ Current track skip kar diya gaya.', ephemeral: true });
        }

        if (interaction.customId === 'music_loop') {
            const currentLoop = player.loop;
            if (currentLoop === 'NONE') {
                player.setLoop('TRACK');
                return interaction.reply({ content: '🔁 Track Loop **Enabled**.', ephemeral: true });
            } else {
                player.setLoop('NONE');
                return interaction.reply({ content: '🔁 Loop **Disabled**.', ephemeral: true });
            }
        }

        if (interaction.customId === 'music_stop') {
            const is247 = await Music247.findOne({ guildId: interaction.guildId, enabled: true }).catch(() => null);
            player.queue.clear();
            player.stop();

            if (!is247) {
                player.destroy();
                return interaction.reply({ content: '⏹️ Music band karke bot disconnect ho gaya.', ephemeral: true });
            }
            return interaction.reply({ content: '⏹️ Music stopped and queue cleared (24/7 mode active).', ephemeral: true });
        }
    });

    console.log('✔ Rythm Lavalink Music Engine & 24/7 Active.');
};
