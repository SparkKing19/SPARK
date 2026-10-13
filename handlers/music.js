const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder 
} = require('discord.js');
const { Poru } = require('poru');
const Music247 = require('../models/music247');

// Autoplay & Previous tracking store
const autoplayState = new Map();
const previousTracks = new Map();

function buildControllerComponents(player) {
    const isAutoplay = autoplayState.get(player.guildId) || false;
    const isPaused = player.isPaused;
    const isLoop = player.loop !== 'NONE';

    // Row 1: Controls (⏸ / ▶, ⏮, ⏹, ⏭, 🔁)
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('btn_pause_resume')
            .setEmoji(isPaused ? '▶️' : '⏸️')
            .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('btn_previous')
            .setEmoji('⏮️')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('btn_stop')
            .setEmoji('⏹️')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('btn_skip')
            .setEmoji('⏭️')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('btn_loop')
            .setEmoji('🔁')
            .setStyle(isLoop ? ButtonStyle.Primary : ButtonStyle.Secondary)
    );

    // Row 2: Utilities (🔉, 🔊, ♾️ Autoplay, 🔀 Shuffle, 💾 Save)
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('btn_voldown')
            .setEmoji('🔉')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('btn_volup')
            .setEmoji('🔊')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('btn_autoplay')
            .setEmoji('♾️')
            .setStyle(isAutoplay ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('btn_shuffle')
            .setEmoji('🔀')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('btn_save')
            .setEmoji('💾')
            .setStyle(ButtonStyle.Secondary)
    );

    // Row 3: Audio Filter Menu
    const row3 = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('menu_filters')
            .setPlaceholder('Select an audio filter...')
            .addOptions([
                { label: 'Bassboost', description: 'Deep bass boost audio enhancement', value: 'filter_bass', emoji: '🔊' },
                { label: 'Nightcore', description: 'Faster tempo and higher pitch', value: 'filter_nightcore', emoji: '⚡' },
                { label: '8D Audio', description: 'Rotating spatial surround sound', value: 'filter_8d', emoji: '🎧' },
                { label: 'Vaporwave', description: 'Slowed down lo-fi atmospheric aesthetic', value: 'filter_vaporwave', emoji: '🌊' },
                { label: 'Reset Filters', description: 'Remove active audio filters', value: 'filter_clear', emoji: '❌' }
            ])
    );

    return [row1, row2, row3];
}

module.exports = async (client) => {
    const nodes = [
        {
            name: 'SparkCore-Private-Lavalink',
            host: 'Lavalink-production-cf42.up.railway.app',
            port: 443,
            password: 'sparkcore123',
            secure: true
        }
    ];

    const poru = new Poru(client, nodes, {
        library: 'discord.js',
        defaultPlatform: 'ytsearch'
    });

    client.poru = poru;
    client.autoplayState = autoplayState;
    client.previousTracks = previousTracks;

    poru.on('nodeConnect', async (node) => {
        console.log(`✔ Private Lavalink Server Online: ${node.name}`);
        try {
            const records = await Music247.find({ enabled: true }).catch(() => []);
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
        } catch (e) {}
    });

    poru.on('nodeError', (node, err) => {
        console.error(`Lavalink Server Error: ${err.message}`);
    });

    // Track Start Event (Exact Card Embed)
    poru.on('trackStart', (player, track) => {
        const channel = client.channels.cache.get(player.textChannel);
        if (!channel) return;

        if (player.currentTrack) {
            previousTracks.set(player.guildId, player.currentTrack);
        }

        const source = track.info.sourceName ? track.info.sourceName.toUpperCase() : 'YOUTUBE';
        const duration = track.info.isStream ? 'LIVE' : new Date(track.info.length).toISOString().substr(14, 5);
        const reqUser = track.info.requester ? track.info.requester.username : 'User';
        const reqAvatar = track.info.requester ? track.info.requester.displayAvatarURL() : undefined;

        const embed = new EmbedBuilder()
            .setColor('#2B2D31')
            .setDescription(`## <a:play_rec:1559415361290641429> Now Playing...\n\n[**${track.info.title}**](${track.info.uri})\n\n> **Artist:** \`${track.info.author}\` • **Source:** \`${source}\`\n> **Duration:** \`${duration}\` • **Volume:** \`${player.volume}%\``)
            .setImage(track.info.image || client.user.displayAvatarURL({ size: 1024 }))
            .setFooter({ text: `Requested by ${reqUser}`, iconURL: reqAvatar });

        channel.send({ embeds: [embed], components: buildControllerComponents(player) })
            .then(msg => { player.controllerMsg = msg; })
            .catch(() => {});
    });

    // Queue End Event -> Autoplay Engine
    poru.on('queueEnd', async (player) => {
        const isAutoplay = autoplayState.get(player.guildId);
        const lastTrack = previousTracks.get(player.guildId) || player.currentTrack;

        if (isAutoplay && lastTrack) {
            try {
                const searchTitle = `${lastTrack.info.author} songs`;
                const res = await poru.resolve({ query: searchTitle, source: 'scsearch', requester: client.user });
                if (res && res.tracks && res.tracks.length) {
                    const nextTrack = res.tracks[Math.floor(Math.random() * Math.min(res.tracks.length, 5))];
                    player.queue.add(nextTrack);
                    return player.play();
                }
            } catch (err) {}
        }

        const is247 = await Music247.findOne({ guildId: player.guildId, enabled: true }).catch(() => null);
        const channel = client.channels.cache.get(player.textChannel);

        if (!is247) {
            if (channel) channel.send('✅ Queue ended. Disconnecting to save resources.').catch(() => {});
            player.destroy();
        } else {
            if (channel) channel.send('✅ Queue empty. (24/7 Mode Active)').catch(() => {});
        }
    });

    client.once('ready', () => {
        poru.init(client);
    });

    // Buttons & Dropdown Handlers
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;
        if (!interaction.customId.startsWith('btn_') && interaction.customId !== 'menu_filters') return;

        const player = poru.players.get(interaction.guildId);
        if (!player || !player.currentTrack) {
            return interaction.reply({ content: '❌ Koi gaana play nahi ho raha hai.', ephemeral: true });
        }

        if (!interaction.member.voice.channel || interaction.member.voice.channel.id !== player.voiceChannel) {
            return interaction.reply({ content: '❌ Controller use karne ke liye bot ke Voice Channel me hona zaroori hai!', ephemeral: true });
        }

        // Audio Filter Selection
        if (interaction.isStringSelectMenu() && interaction.customId === 'menu_filters') {
            const val = interaction.values[0];
            await interaction.deferUpdate();

            if (val === 'filter_bass') {
                player.filters.setEqualizer([
                    { band: 0, gain: 0.35 },
                    { band: 1, gain: 0.30 },
                    { band: 2, gain: 0.25 }
                ]);
            } else if (val === 'filter_nightcore') {
                player.filters.setTimescale({ speed: 1.25, pitch: 1.25, rate: 1.0 });
            } else if (val === 'filter_8d') {
                player.filters.setRotation({ rotationHz: 0.2 });
            } else if (val === 'filter_vaporwave') {
                player.filters.setTimescale({ speed: 0.85, pitch: 0.80, rate: 1.0 });
            } else if (val === 'filter_clear') {
                player.filters.clearFilters();
            }
            return;
        }

        const action = interaction.customId;

        if (action === 'btn_pause_resume') {
            if (player.isPaused) player.pause(false);
            else player.pause(true);
            return interaction.update({ components: buildControllerComponents(player) });
        }

        if (action === 'btn_previous') {
            const prev = previousTracks.get(interaction.guildId);
            if (!prev) {
                return interaction.reply({ content: '❌ Pichla koi track record me nahi hai.', ephemeral: true });
            }
            player.queue.unshift(prev);
            player.stop();
            return interaction.reply({ content: `⏮️ Playing previous track: **${prev.info.title}**`, ephemeral: true });
        }

        if (action === 'btn_skip') {
            const title = player.currentTrack.info.title;
            player.stop();
            return interaction.reply({ content: `⏭️ Skipped: **${title}**`, ephemeral: true });
        }

        if (action === 'btn_stop') {
            const is247 = await Music247.findOne({ guildId: interaction.guildId, enabled: true }).catch(() => null);
            player.queue.clear();
            player.stop();
            if (!is247) player.destroy();
            return interaction.reply({ content: '⏹️ Playback stopped.', ephemeral: true });
        }

        if (action === 'btn_loop') {
            if (player.loop === 'NONE') player.setLoop('TRACK');
            else if (player.loop === 'TRACK') player.setLoop('QUEUE');
            else player.setLoop('NONE');
            return interaction.update({ components: buildControllerComponents(player) });
        }

        if (action === 'btn_volup') {
            const newVol = Math.min(player.volume + 10, 150);
            player.setVolume(newVol);
            return interaction.reply({ content: `🔊 Volume: **${newVol}%**`, ephemeral: true });
        }

        if (action === 'btn_voldown') {
            const newVol = Math.max(player.volume - 10, 10);
            player.setVolume(newVol);
            return interaction.reply({ content: `🔉 Volume: **${newVol}%**`, ephemeral: true });
        }

        if (action === 'btn_autoplay') {
            const current = autoplayState.get(interaction.guildId) || false;
            autoplayState.set(interaction.guildId, !current);
            return interaction.update({ components: buildControllerComponents(player) });
        }

        if (action === 'btn_shuffle') {
            if (player.queue.length < 2) {
                return interaction.reply({ content: '❌ Queue me shuffle karne ke liye kam se kam 2 gaane hone chahiye.', ephemeral: true });
            }
            player.queue.shuffle();
            return interaction.reply({ content: '🔀 Queue successfully shuffled!', ephemeral: true });
        }

        if (action === 'btn_save') {
            try {
                const track = player.currentTrack;
                const saveEmbed = new EmbedBuilder()
                    .setColor('#5865F2')
                    .setTitle('💾 Saved Track')
                    .setDescription(`[**${track.info.title}**](${track.info.uri})`)
                    .addFields(
                        { name: 'Author', value: track.info.author, inline: true },
                        { name: 'Server', value: interaction.guild.name, inline: true }
                    )
                    .setThumbnail(track.info.image || null);

                await interaction.user.send({ embeds: [saveEmbed] });
                return interaction.reply({ content: '📩 Gaana aapki DM me save kar diya gaya hai!', ephemeral: true });
            } catch (err) {
                return interaction.reply({ content: '❌ Aapki DM band hai, isliye save nahi ho saka.', ephemeral: true });
            }
        }
    });

    console.log('✔ Custom Rythm UI Controller Engine Active.');
};
                 
