const GuildConfig = require('../models/guildConfig');
const Music247 = require('../models/music247');

module.exports = async (client, message) => {
    // Ignore bots and DM
    if (message.author.bot || !message.guild) return;

    const PREFIX = '%';
    if (!message.content.startsWith(PREFIX)) return;

    console.log(`[PREFIX DETECTED] Message: "${message.content}" from ${message.author.tag}`);

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();
    const poru = client.poru;

    // 1. %setup / %music panel
    if (commandName === 'setup' || commandName === 'music') {
        const sub = args[0]?.toLowerCase();
        if (commandName === 'music' && sub !== 'panel') return;

        // Check: Server Owner or Admin
        const isOwner = message.guild.ownerId === message.author.id;
        const isAdmin = message.member.permissions.has('Administrator');
        
        if (!isOwner && !isAdmin) {
            return message.reply('❌ Only the Server Owner or Admins can setup the music panel.');
        }

        try {
            const embed = client.getPanelEmbed(client, null, null);
            const components = client.getPanelComponents(null);

            const panelMsg = await message.channel.send({ embeds: [embed], components });

            await GuildConfig.findOneAndUpdate(
                { guildId: message.guild.id },
                { panelChannelId: message.channel.id, panelMessageId: panelMsg.id },
                { upsert: true }
            );

            return message.reply(`✅ Music controller panel successfully created in <#${message.channel.id}>!`);
        } catch (err) {
            console.error('[PANEL SETUP ERROR]:', err);
            return message.reply(`❌ Setup error: \`${err.message}\``);
        }
    }

    // 2. %play (Public)
    if (commandName === 'play' || commandName === 'p') {
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) {
            return message.reply('❌ You must be connected to a Voice Channel to play music.');
        }

        const query = args.join(' ');
        if (!query) {
            return message.reply('❌ Please provide a song name or link: `%play <query/url>`');
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

        const statusMsg = await message.reply('🔍 Searching audio stream...');

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
            console.error('Play command error:', err);
            return statusMsg.edit(`❌ Playback error: \`${err.message}\``);
        }
    }

    // 3. %skip
    if (commandName === 'skip' || commandName === 's') {
        const player = poru.players.get(message.guild.id);
        if (!player || !player.currentTrack) return message.reply('❌ No track is currently playing.');
        player.stop();
        return message.reply('⏭️ Skipped current track.');
    }

    // 4. %stop
    if (commandName === 'stop') {
        const player = poru.players.get(message.guild.id);
        if (!player) return message.reply('❌ Bot is not active.');
        player.queue.clear();
        player.stop();
        const is247 = await Music247.findOne({ guildId: message.guild.id, enabled: true }).catch(() => null);
        if (!is247) player.destroy();
        await client.updateGuildPanel(client, message.guild.id, null, null);
        return message.reply('⏹️ Playback stopped.');
    }
};
