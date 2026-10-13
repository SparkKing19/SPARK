const GuildConfig = require('../models/guildConfig');
const Music247 = require('../models/music247');

// Permission checker helper
async function isAuthorizedUser(message, client) {
    // 1. Bot application owner
    if (client.application?.owner) {
        if (client.application.owner.id === message.author.id) return true;
        if (client.application.owner.members?.has(message.author.id)) return true;
    }
    // 2. Server Owner
    if (message.guild.ownerId === message.author.id) return true;

    // 3. Extra Owner configured in DB
    const conf = await GuildConfig.findOne({ guildId: message.guild.id });
    if (conf && conf.extraOwners.includes(message.author.id)) return true;

    // 4. Administrator permission fallback
    if (message.member.permissions.has('Administrator')) return true;

    return false;
}

module.exports = async (client, message) => {
    if (message.author.bot || !message.guild) return;

    const PREFIX = '%';
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();
    const poru = client.poru;

    // 1. %music panel / %setup (Owner Only)
    if (commandName === 'music' || commandName === 'setup') {
        const sub = args[0]?.toLowerCase();
        if (commandName === 'music' && sub !== 'panel') return;

        const authorized = await isAuthorizedUser(message, client);
        if (!authorized) {
            return message.reply('❌ You do not have permission to setup the music panel.');
        }

        const embed = client.getPanelEmbed(client, null, null);
        const components = client.getPanelComponents(null);

        const panelMsg = await message.channel.send({ embeds: [embed], components });

        await GuildConfig.findOneAndUpdate(
            { guildId: message.guild.id },
            { panelChannelId: message.channel.id, panelMessageId: panelMsg.id },
            { upsert: true }
        );

        return message.reply(`✅ Music controller panel successfully configured in <#${message.channel.id}>!`);
    }

    // 2. %play (Public Command)
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

        const statusMsg = await message.reply('🔍 Searching audio stream...');

        try {
            const isUrl = query.startsWith('http://') || query.startsWith('https://');
            let res = null;

            if (isUrl) {
                res = await poru.resolve({ query, requester: message.author });
            } else {
                // Dual Search Resolution: SoundCloud & Spotify fallback
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

    // 3. %skip (Public)
    if (commandName === 'skip' || commandName === 's') {
        const player = poru.players.get(message.guild.id);
        if (!player || !player.currentTrack) return message.reply('❌ No track is currently playing.');
        if (!message.member.voice.channel || message.member.voice.channel.id !== player.voiceChannel) {
            return message.reply('❌ You must be in the same voice channel as the bot.');
        }

        player.stop();
        return message.reply('⏭️ Skipped current track.');
    }

    // 4. %stop (Owner / Moderator Protected)
    if (commandName === 'stop') {
        const authorized = await isAuthorizedUser(message, client);
        if (!authorized) return message.reply('❌ Only Server Owners/Extra Owners can execute `%stop`. Use the panel buttons instead.');

        const player = poru.players.get(message.guild.id);
        if (!player) return message.reply('❌ Bot is not active.');

        player.queue.clear();
        player.stop();
        const is247 = await Music247.findOne({ guildId: message.guild.id, enabled: true }).catch(() => null);
        if (!is247) player.destroy();

        await client.updateGuildPanel(client, message.guild.id, null, null);
        return message.reply('⏹️ Stopped playback and cleared queue.');
    }

    // 5. %247 (Owner Only)
    if (commandName === '247') {
        const authorized = await isAuthorizedUser(message, client);
        if (!authorized) return message.reply('❌ You do not have permission to change 24/7 settings.');

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

    // 6. %addowner / %delowner (Server Owner only)
    if (commandName === 'addowner') {
        if (message.guild.ownerId !== message.author.id) return message.reply('❌ Only the Server Owner can designate Extra Owners.');
        const target = message.mentions.users.first();
        if (!target) return message.reply('❌ Mention a user: `%addowner @user`');

        await GuildConfig.findOneAndUpdate(
            { guildId: message.guild.id },
            { $addToSet: { extraOwners: target.id } },
            { upsert: true }
        );
        return message.reply(`✅ Added **${target.username}** as an Extra Owner.`);
    }
};
