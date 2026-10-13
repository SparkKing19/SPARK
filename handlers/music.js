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

const previousTracks = new Map();

// Safe Stop/Skip Helper (Poru compatibility fix)
function safeStopTrack(player) {
    if (!player) return;
    if (typeof player.skip === 'function') {
        player.skip();
    } else if (typeof player.stop === 'function') {
        player.stop();
    } else {
        player.destroy();
    }
}

// Controller Panel Components
function getPanelComponents(player = null) {
    const isPaused = player ? player.isPaused : false;
    const isLoop = player ? player.loop !== 'NONE' : false;

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
            .setStyle(ButtonStyle.Primary) // Always active
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

// Live Embed
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
        .setDescription(`## <a:play_rec:1559415361290641429> Now Playing...\n\n[**${track.info.title}**](${track.info.uri})\n\n> **Artist:** \`${track.info.author}\` • **Source:** \`${source}\`\n> **Duration:** \`${duration}\` • **Volume:** \`${player.volume}%\`\n> **Autoplay:** \`Active (Endless)\` • **Channel:** <#${player.voiceChannel}>`)
        .setImage(track.info.image || client.user.displayAvatarURL({ size: 1024 }))
        .setFooter({ 
            text: `Requested by ${track.info.requester?.username || 'Autoplay Engine'}`, 
            iconURL: track.info.requester?.displayAvatarURL() || undefined 
        });
}

// Update Panel Message
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

    // Endless Autoplay Logic
    poru.on('queueEnd', async (player) => {
        const lastTrack = previousTracks.get(player.guildId) || player.currentTrack;

        if (lastTrack && !player.isDestroyed) {
            try {
                const searchKeywords = [
                    `${lastTrack.info.author} songs`,
                    `${lastTrack.info.title} mix`,
                    `${lastTrack.info.author} audio`
                ];
                const query = searchKeywords[Math.floor(Math.random() * searchKeywords.length)];

                let res = await poru.resolve({ query, source: 'scsearch', requester: client.user });
                if (!res || !res.tracks || !res.tracks.length) {
                    res = await poru.resolve({ query, source: 'spsearch', requester: client.user });
                }
                if (!res || !res.tracks || !res.tracks.length) {
                    res = await poru.resolve({ query, source: 'ytsearch', requester: client.user });
                }

                if (res && res.tracks && res.tracks.length) {
                    const filtered = res.tracks.filter(t => t.info.title !== lastTrack.info.title);
                    const nextTrack = filtered.length ? filtered[Math.floor(Math.random() * Math.min(filtered.length, 5))] : res.tracks[0];
                    
                    player.queue.add(nextTrack);
                    return player.play();
                }
            } catch (err) {
                console.error('Autoplay resolution error:', err);
            }
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

    // Prefix Commands Handler
    client.on('messageCreate', async (message) => {
        if (message.author.bot || !message.guild) return;

        const PREFIX = '%';
        if (!message.content.startsWith(PREFIX)) return;

        const args = message.content.slice(PREFIX.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        // %setup / %music panel
        if (commandName === 'setup' || commandName === 'music') {
            const sub = args[0]?.toLowerCase();
            if (commandName === 'music' && sub !== 'panel') return;

            const isOwner = message.guild.ownerId === message.author.id;
            const isAdmin = message.member.permissions.has('Administrator');
            const conf = await GuildConfig.findOne({ guildId: message.guild.id }).catch(() => null);
            const isExtraOwner = conf && conf.extraOwners?.includes(message.author.id);

            if (!isOwner && !isAdmin && !isExtraOwner) {
                return message.reply('❌ Only Server Owner, Admins, or Extra Owners can setup the music panel.');
            }

            try {
                const embed = getPanelEmbed(client, null, null);
                const components = getPanelComponents(null);

                const panelMsg = await message.channel.send({ embeds: [embed], components });

                await GuildConfig.findOneAndUpdate(
                    { guildId: message.guild.id },
                    { panelChannelId: message.channel.id, panelMessageId: panelMsg.id },
                    { upsert: true }
                );

                return message.reply(`✅ Music controller panel configured in <#${message.channel.id}>!`);
            } catch (err) {
                return message.reply(`❌ Setup error: \`${err.message}\``);
            }
        }

        // %play / %p
        if (commandName === 'play' || commandName === 'p') {
            const voiceChannel = message.member.voice.channel;
            if (!voiceChannel) {
                return message.reply('❌ You must be connected to a Voice Channel to play music.');
            }

            const query = args.join(' ');
            if (!query) {
                return message.reply('❌ Please provide a song name or valid URL: `%play <query/url>`');
            }

            let player = poru.players.get(message.guild.id);
            if (!player) {
                player = poru.createConnection({
                    guildId: message.guild.id,
                    voiceChannel: voiceChannel.id,
                    textChannel: message.channel.id,
                    deaf: true
                });
            }

            const statusMsg = await message.reply('🔍 Resolving audio track...');

            try {
                const isUrl = query.startsWith('http://') || query.startsWith('https://');
                let res = null;

                if (isUrl) {
                    res = await poru.resolve({ query, requester: message.author });
                } else {
                    res = await poru.resolve({ query, source: 'scsearch', requester: message.author });
                    if (!res || !res.tracks || !res.tracks.length) {
                        res = await poru.resolve({ query, source: 'spsearch', requester: message.author });
                    }
                    if (!res || !res.tracks || !res.tracks.length) {
                        res = await poru.resolve({ query, source: 'ytsearch', requester: message.author });
                    }
                }

                if (!res || res.loadType === 'LOAD_FAILED' || res.loadType === 'NO_MATCHES' || !res.tracks.length) {
                    return statusMsg.edit(`❌ No audio tracks found for: **${query}**`);
                }

                if (res.loadType === 'PLAYLIST_LOADED') {
                    for (const t of res.tracks) player.queue.add(t);
                    if (!player.isPlaying && !player.isPaused) player.play();
                    return statusMsg.edit(`🎶 Added playlist **${res.playlistInfo.name}** (\`${res.tracks.length}\` tracks) to queue.`);
                }

                const track = res.tracks[0];
                player.queue.add(track);

                if (!player.isPlaying && !player.isPaused) {
                    player.play();
                    return statusMsg.edit(`🎶 Now playing: **${track.info.title}**`);
                } else {
                    return statusMsg.edit(`✅ Added to queue: **${track.info.title}**`);
                }
            } catch (err) {
                return statusMsg.edit(`❌ Playback error: \`${err.message}\``);
            }
        }

        // %skip / %s (Fixed method)
        if (commandName === 'skip' || commandName === 's') {
            const player = poru.players.get(message.guild.id);
            if (!player || !player.currentTrack) return message.reply('❌ No track is currently playing.');
            if (!message.member.voice.channel || message.member.voice.channel.id !== player.voiceChannel) {
                return message.reply('❌ You must be in the same voice channel as the bot.');
            }
            safeStopTrack(player);
            return message.reply('⏭️ Skipped current track.');
        }

        // %stop
        if (commandName === 'stop') {
            const player = poru.players.get(message.guild.id);
            if (!player) return message.reply('❌ Bot is not active.');

            previousTracks.delete(message.guild.id);
            player.queue.clear();
            
            const is247 = await Music247.findOne({ guildId: message.guild.id, enabled: true }).catch(() => null);
            if (!is247) {
                player.destroy();
            } else {
                safeStopTrack(player);
            }

            await updateGuildPanel(client, message.guild.id, null, null);
            return message.reply('⏹️ Playback stopped and autoplay paused.');
        }

        // %247
        if (commandName === '247') {
            const isOwner = message.guild.ownerId === message.author.id;
            const isAdmin = message.member.permissions.has('Administrator');
            if (!isOwner && !isAdmin) {
                return message.reply('❌ Only Server Owner or Admins can configure 24/7 mode.');
            }

            const voiceChannel = message.member.voice.channel;
            if (!voiceChannel) return message.reply('❌ Join a voice channel first to enable 24/7 mode.');

            const existing = await Music247.findOne({ guildId: message.guild.id, enabled: true });
            if (existing) {
                await Music247.findOneAndUpdate({ guildId: message.guild.id }, { enabled: false });
                return message.reply('🔓 **24/7 Mode Disabled!**');
            } else {
                await Music247.findOneAndUpdate(
                    { guildId: message.guild.id },
                    { voiceChannelId: voiceChannel.id, textChannelId: message.channel.id, enabled: true },
                    { upsert: true }
                );
                return message.reply(`🔒 **24/7 Mode Enabled!** Bot will remain online in <#${voiceChannel.id}>.`);
            }
        }
    });

    // Panel Buttons & Dropdown Handlers
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;
        if (!interaction.customId.startsWith('btn_') && interaction.customId !== 'menu_filters') return;

        const player = poru.players.get(interaction.guildId);
        if (!player || !player.currentTrack) {
            return interaction.reply({ content: '❌ There is no active track playing right now.', flags: 64 });
        }

        if (!interaction.member.voice.channel || interaction.member.voice.channel.id !== player.voiceChannel) {
            return interaction.reply({ 
                content: `❌ You must be connected to <#${player.voiceChannel}> to use the controller.`, 
                flags: 64 
            });
        }

        // Filters
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
            await updateGuildPanel(client, player.guildId, player, player.currentTrack);
            return interaction.reply({ 
                content: player.isPaused ? '⏸️ Playback paused.' : '▶️ Playback resumed.', 
                flags: 64 
            });
        }

        if (action === 'btn_previous') {
            const prev = previousTracks.get(interaction.guildId);
            if (!prev) {
                return interaction.reply({ content: '❌ No previous track found.', flags: 64 });
            }
            player.queue.unshift(prev);
            safeStopTrack(player);
            return interaction.reply({ content: `⏮️ Playing previous: **${prev.info.title}**`, flags: 64 });
        }

        if (action === 'btn_skip') {
            const title = player.currentTrack.info.title;
            safeStopTrack(player);
            return interaction.reply({ content: `⏭️ Skipped **${title}**.`, flags: 64 });
        }

        if (action === 'btn_stop') {
            previousTracks.delete(interaction.guildId);
            player.queue.clear();
            const is247 = await Music247.findOne({ guildId: interaction.guildId, enabled: true }).catch(() => null);
            if (!is247) {
                player.destroy();
            } else {
                safeStopTrack(player);
            }
            await updateGuildPanel(client, player.guildId, null, null);
            return interaction.reply({ content: '⏹️ Stopped playback.', flags: 64 });
        }

        if (action === 'btn_loop') {
            if (player.loop === 'NONE') player.setLoop('TRACK');
            else if (player.loop === 'TRACK') player.setLoop('QUEUE');
            else player.setLoop('NONE');

            await updateGuildPanel(client, player.guildId, player, player.currentTrack);
            return interaction.reply({ content: `🔁 Loop mode: **${player.loop}**`, flags: 64 });
        }

        if (action === 'btn_volup') {
            const newVol = Math.min(player.volume + 10, 150);
            player.setVolume(newVol);
            await updateGuildPanel(client, player.guildId, player, player.currentTrack);
            return interaction.reply({ content: `🔊 Volume: **${newVol}%**`, flags: 64 });
        }

        if (action === 'btn_voldown') {
            const newVol = Math.max(player.volume - 10, 10);
            player.setVolume(newVol);
            await updateGuildPanel(client, player.guildId, player, player.currentTrack);
            return interaction.reply({ content: `🔉 Volume: **${newVol}%**`, flags: 64 });
        }

        if (action === 'btn_autoplay') {
            return interaction.reply({ content: '♾️ Autoplay is permanently active for non-stop music.', flags: 64 });
        }

        if (action === 'btn_shuffle') {
            player.queue.shuffle();
            return interaction.reply({ content: '🔀 Queue shuffled.', flags: 64 });
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
                return interaction.reply({ content: '📩 Sent song details to your DM.', flags: 64 });
            } catch (err) {
                return interaction.reply({ content: '❌ DM is closed.', flags: 64 });
            }
        }
    });

    console.log('✔ Rythm Music Engine & Endless Autoplay Active.');
};
