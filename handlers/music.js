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

const autoplayState = new Map();
const previousTracks = new Map();

// Helper: Controller Panel Components
function getPanelComponents(player = null) {
    const isPaused = player ? player.isPaused : false;
    const isLoop = player ? player.loop !== 'NONE' : false;
    const isAutoplay = player ? (autoplayState.get(player.guildId) || false) : false;

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('btn_pause_resume')
            .setEmoji(isPaused ? '▶️' : '⏸️')
            .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(!player || !player.currentTrack),
        new ButtonBuilder()
            .setCustomId('btn_previous')
            .setEmoji('⏮️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!player || !player.currentTrack),
        new ButtonBuilder()
            .setCustomId('btn_stop')
            .setEmoji('⏹️')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(!player || !player.currentTrack),
        new ButtonBuilder()
            .setCustomId('btn_skip')
            .setEmoji('⏭️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!player || !player.currentTrack),
        new ButtonBuilder()
            .setCustomId('btn_loop')
            .setEmoji('🔁')
            .setStyle(isLoop ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(!player || !player.currentTrack)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('btn_voldown')
            .setEmoji('🔉')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!player || !player.currentTrack),
        new ButtonBuilder()
            .setCustomId('btn_volup')
            .setEmoji('🔊')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!player || !player.currentTrack),
        new ButtonBuilder()
            .setCustomId('btn_autoplay')
            .setEmoji('♾️')
            .setStyle(isAutoplay ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(!player || !player.currentTrack),
        new ButtonBuilder()
            .setCustomId('btn_shuffle')
            .setEmoji('🔀')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!player || !player.currentTrack || player.queue.length < 2),
        new ButtonBuilder()
            .setCustomId('btn_save')
            .setEmoji('💾')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!player || !player.currentTrack)
    );

    const row3 = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('menu_filters')
            .setPlaceholder('Select an audio filter...')
            .setDisabled(!player || !player.currentTrack)
            .addOptions([
                { label: 'Bassboost', description: 'Deep bass enhancement', value: 'filter_bass', emoji: '🔊' },
                { label: 'Nightcore', description: 'Faster tempo and higher pitch', value: 'filter_nightcore', emoji: '⚡' },
                { label: '8D Audio', description: 'Rotating spatial surround sound', value: 'filter_8d', emoji: '🎧' },
                { label: 'Vaporwave', description: 'Slowed down aesthetic audio', value: 'filter_vaporwave', emoji: '🌊' },
                { label: 'Reset Filters', description: 'Remove active audio filters', value: 'filter_clear', emoji: '❌' }
            ])
    );

    return [row1, row2, row3];
}

// Helper: Build Live Embed
function getPanelEmbed(client, player = null, track = null) {
    if (!player || !track) {
        return new EmbedBuilder()
            .setColor('#2B2D31')
            .setTitle('🎶 Music Control Panel')
            .setDescription('No track currently playing.\nJoin a voice channel and type `%play <title or link>` to start playback.')
            .setImage('https://dummyimage.com/1280x350/1e1f22/7289da&text=Ready+For+Music')
            .setFooter({ text: 'SparkCore Music System • Standing By' });
    }

    const duration = track.info.isStream ? 'LIVE' : new Date(track.info.length).toISOString().substr(14, 5);
    const source = (track.info.sourceName || 'Audio Stream').toUpperCase();

    return new EmbedBuilder()
        .setColor('#5865F2')
        .setDescription(`## <a:play_rec:1559415361290641429> Now Playing...\n\n[**${track.info.title}**](${track.info.uri})\n\n> **Artist:** \`${track.info.author}\` • **Source:** \`${source}\`\n> **Duration:** \`${duration}\` • **Volume:** \`${player.volume}%\`\n> **Channel:** <#${player.voiceChannel}>`)
        .setImage(track.info.image || client.user.displayAvatarURL({ size: 1024 }))
        .setFooter({ 
            text: `Requested by ${track.info.requester?.username || 'User'}`, 
            iconURL: track.info.requester?.displayAvatarURL() || undefined 
        });
}

// Live Panel Auto-Updater
async function updateGuildPanel(client, guildId, player = null, track = null) {
    try {
        const conf = await GuildConfig.findOne({ guildId });
        if (!conf || !conf.panelChannelId || !conf.panelMessageId) return;

        const channel = client.channels.cache.get(conf.panelChannelId);
        if (!channel) return;

        const msg = await channel.messages.fetch(conf.panelMessageId).catch(() => null);
        if (!msg) return;

        const embed = getPanelEmbed(client, player, track);
        const components = getPanelComponents(player);
        await msg.edit({ embeds: [embed], components });
    } catch (err) {}
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
    client.updateGuildPanel = updateGuildPanel;
    client.getPanelComponents = getPanelComponents;
    client.getPanelEmbed = getPanelEmbed;

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

    poru.on('trackStart', async (player, track) => {
        if (player.currentTrack) {
            previousTracks.set(player.guildId, player.currentTrack);
        }
        await updateGuildPanel(client, player.guildId, player, track);
    });

    poru.on('queueEnd', async (player) => {
        const isAutoplay = autoplayState.get(player.guildId);
        const lastTrack = previousTracks.get(player.guildId) || player.currentTrack;

        if (isAutoplay && lastTrack) {
            try {
                const searchTitle = `${lastTrack.info.author} audio`;
                let res = await poru.resolve({ query: searchTitle, source: 'scsearch', requester: client.user });
                if (!res || !res.tracks || !res.tracks.length) {
                    res = await poru.resolve({ query: searchTitle, source: 'spsearch', requester: client.user });
                }
                if (res && res.tracks && res.tracks.length) {
                    const nextTrack = res.tracks[Math.floor(Math.random() * Math.min(res.tracks.length, 5))];
                    player.queue.add(nextTrack);
                    return player.play();
                }
            } catch (err) {}
        }

        await updateGuildPanel(client, player.guildId, null, null);

        const is247 = await Music247.findOne({ guildId: player.guildId, enabled: true }).catch(() => null);
        if (!is247) {
            player.destroy();
        }
    });

    client.once('ready', () => {
        poru.init(client);
    });

    // Interactive Controller Handlers
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;
        if (!interaction.customId.startsWith('btn_') && interaction.customId !== 'menu_filters') return;

        const player = poru.players.get(interaction.guildId);
        if (!player || !player.currentTrack) {
            return interaction.reply({ content: '❌ There is no active track playing right now.', flags: 64 });
        }

        // Voice connection presence verification
        if (!interaction.member.voice.channel || interaction.member.voice.channel.id !== player.voiceChannel) {
            return interaction.reply({ 
                content: `❌ You must be connected to <#${player.voiceChannel}> to control the music panel.`, 
                flags: 64 
            });
        }

        // Dropdown Filters
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

        // Buttons Handler
        const action = interaction.customId;

        if (action === 'btn_pause_resume') {
            if (player.isPaused) player.pause(false);
            else player.pause(true);
            await updateGuildPanel(client, player.guildId, player, player.currentTrack);
            return interaction.reply({ 
                content: player.isPaused ? '⏸️ Playback paused.' : '▶️ Playback resumed.', 
                flags: 64 
            });
        }

        if (action === 'btn_previous') {
            const prev = previousTracks.get(interaction.guildId);
            if (!prev) {
                return interaction.reply({ content: '❌ No previous track found in history.', flags: 64 });
            }
            player.queue.unshift(prev);
            player.stop();
            return interaction.reply({ content: `⏮️ Playing previous track: **${prev.info.title}**`, flags: 64 });
        }

        if (action === 'btn_skip') {
            const title = player.currentTrack.info.title;
            player.stop();
            return interaction.reply({ content: `⏭️ Skipped **${title}**.`, flags: 64 });
        }

        if (action === 'btn_stop') {
            const is247 = await Music247.findOne({ guildId: interaction.guildId, enabled: true }).catch(() => null);
            player.queue.clear();
            player.stop();
            if (!is247) player.destroy();
            await updateGuildPanel(client, player.guildId, null, null);
            return interaction.reply({ content: '⏹️ Stopped playback and cleared queue.', flags: 64 });
        }

        if (action === 'btn_loop') {
            if (player.loop === 'NONE') player.setLoop('TRACK');
            else if (player.loop === 'TRACK') player.setLoop('QUEUE');
            else player.setLoop('NONE');

            await updateGuildPanel(client, player.guildId, player, player.currentTrack);
            return interaction.reply({ content: `🔁 Loop mode updated: **${player.loop}**`, flags: 64 });
        }

        if (action === 'btn_volup') {
            const newVol = Math.min(player.volume + 10, 150);
            player.setVolume(newVol);
            await updateGuildPanel(client, player.guildId, player, player.currentTrack);
            return interaction.reply({ content: `🔊 Volume increased to **${newVol}%**.`, flags: 64 });
        }

        if (action === 'btn_voldown') {
            const newVol = Math.max(player.volume - 10, 10);
            player.setVolume(newVol);
            await updateGuildPanel(client, player.guildId, player, player.currentTrack);
            return interaction.reply({ content: `🔉 Volume decreased to **${newVol}%**.`, flags: 64 });
        }

        if (action === 'btn_autoplay') {
            const current = autoplayState.get(interaction.guildId) || false;
            autoplayState.set(interaction.guildId, !current);
            await updateGuildPanel(client, player.guildId, player, player.currentTrack);
            return interaction.reply({ content: `♾️ Autoplay is now **${!current ? 'Enabled' : 'Disabled'}**.`, flags: 64 });
        }

        if (action === 'btn_shuffle') {
            player.queue.shuffle();
            return interaction.reply({ content: '🔀 Queue has been randomized.', flags: 64 });
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
                return interaction.reply({ content: '📩 Sent song details to your Direct Messages!', flags: 64 });
            } catch (err) {
                return interaction.reply({ content: '❌ Could not send DM. Please check your privacy settings.', flags: 64 });
            }
        }
    });

    console.log('✔ Custom Rythm Panel Music Engine Active.');
};
