const {
    EmbedBuilder,
    PermissionFlagsBits
} = require('discord.js');
const {
    formatDuration,
    getTrackTitle,
    getTrackAuthor,
    getTrackUri,
    getTrackDuration,
    makePlayerEmbed,
    makePlayerButtons,
    COLOR
} = require('../utils/musicUtils');

const PREFIX = '%';

function getVoiceChannel(message) {
    return message.member?.voice?.channel || null;
}

function getPlayer(client, guildId) {
    return client.lavalink?.getPlayer(guildId) || null;
}

function makePlayer(client, message, voiceChannel) {
    const existing = getPlayer(client, message.guild.id);
    if (existing) return existing;
    return client.lavalink.createPlayer({
        guildId: message.guild.id,
        voiceChannelId: voiceChannel.id,
        textChannelId: message.channel.id,
        selfDeaf: true,
        volume: 80
    });
}

async function ensureSameVoiceChannel(message, player) {
    const voice = getVoiceChannel(message);
    if (!voice) {
        await message.reply('Join a voice channel first, then use the music command.');
        return false;
    }
    if (player?.voiceChannelId && player.voiceChannelId !== voice.id) {
        await message.reply('I am already playing in another voice channel. Join that channel first.');
        return false;
    }
    return voice;
}

async function sendNowPlaying(message, player, client, status = 'Playing') {
    const embed = makePlayerEmbed(player, client, status);
    return message.channel.send({ embeds: [embed], components: makePlayerButtons(player) });
}

module.exports = function registerMusicCommands(client) {
    client.on('messageCreate', async message => {
        if (message.author.bot || !message.guild || !message.content.startsWith(PREFIX)) return;

        const content = message.content.slice(PREFIX.length).trim();
        if (!content) return;
        const firstSpace = content.indexOf(' ');
        const command = (firstSpace === -1 ? content : content.slice(0, firstSpace)).toLowerCase();
        const input = firstSpace === -1 ? '' : content.slice(firstSpace + 1).trim();
        const aliases = {
            left: 'leave',
            dc: 'leave',
            np: 'nowplaying',
            now: 'nowplaying',
            vol: 'volume',
            p: 'play',
            q: 'queue',
            next: 'skip',
            unpause: 'resume'
        };
        const cmd = aliases[command] || command;
        const known = new Set([
            'join', 'leave', 'play', 'pause', 'resume', 'skip', 'stop',
            'queue', 'nowplaying', 'volume', 'loop', 'shuffle', 'remove',
            'clear', 'seek', 'help'
        ]);
        if (!known.has(cmd)) return;

        if (!client.lavalink) {
            return message.reply('Music backend is not configured yet. Set up the Lavalink service and its environment variables first.');
        }
        if (!client.lavalink.nodeManager?.nodes?.size && !client.lavalink.nodeManager?.nodes?.length) {
            // The manager can exist while the node is still connecting; commands below will show the actionable error if needed.
        }

        try {
            if (cmd === 'help') {
                const embed = new EmbedBuilder()
                    .setColor(COLOR)
                    .setAuthor({ name: 'SPARK MUSIC', iconURL: client.user.displayAvatarURL() })
                    .setTitle('Music Commands')
                    .setDescription([
                        '`%join` — Join your voice channel',
                        '`%leave` — Leave voice and clear player',
                        '`%play <song name or URL>` — Search and play music',
                        '`%pause` / `%resume` — Pause or resume',
                        '`%skip` — Skip current track',
                        '`%stop` — Stop and clear queue',
                        '`%queue` — Show upcoming songs',
                        '`%nowplaying` — Show the player card',
                        '`%volume 1-100` — Set volume',
                        '`%loop off|song|queue` — Change repeat mode',
                        '`%shuffle` — Shuffle upcoming tracks',
                        '`%remove <number>` — Remove a queued song',
                        '`%clear` — Clear upcoming tracks',
                        '`%seek 1:30` — Seek to a timestamp'
                    ].join('\n'))
                    .setFooter({ text: 'Prefix: % • Music controls also appear as buttons' });
                return message.reply({ embeds: [embed] });
            }

            if (cmd === 'join') {
                const voice = await ensureSameVoiceChannel(message, getPlayer(client, message.guild.id));
                if (!voice) return;
                const player = makePlayer(client, message, voice);
                player.textChannelId = message.channel.id;
                await player.connect();
                return message.reply(`Connected to **${voice.name}**.`);
            }

            if (cmd === 'leave') {
                const player = getPlayer(client, message.guild.id);
                if (!player) return message.reply('I am not connected to a voice channel.');
                await player.destroy('Requested by user', true);
                return message.reply('Disconnected and cleared the music player.');
            }

            if (cmd === 'play') {
                if (!input) return message.reply('Usage: `%play song name or URL`');
                const voice = await ensureSameVoiceChannel(message, getPlayer(client, message.guild.id));
                if (!voice) return;
                await message.channel.sendTyping().catch(() => {});
                const player = makePlayer(client, message, voice);
                player.textChannelId = message.channel.id;
                if (!player.voiceChannelId) player.voiceChannelId = voice.id;
                if (!player.connected) await player.connect();

                const result = await player.search({ query: input }, message.author);
                const tracks = result?.tracks || [];
                if (!tracks.length) return message.reply('No tracks found. Check the query/URL or make sure the Lavalink source plugin is configured.');

                const isPlaylist = Boolean(result.playlistInfo?.name || result.loadType === 'playlist');
                if (isPlaylist) {
                    player.queue.add(tracks);
                    if (!player.playing && !player.paused) await player.play();
                    return message.reply(`Added **${tracks.length} tracks** from the playlist to the queue.`);
                }

                const track = tracks[0];
                player.queue.add(track);
                if (!player.playing && !player.paused) await player.play();

                const embed = new EmbedBuilder()
                    .setColor(COLOR)
                    .setAuthor({ name: 'SPARK MUSIC', iconURL: client.user.displayAvatarURL() })
                    .setDescription(`Added to queue: [${getTrackTitle(track)}](${getTrackUri(track) || 'https://discord.com'})`)
                    .addFields(
                        { name: 'Artist', value: getTrackAuthor(track), inline: true },
                        { name: 'Duration', value: formatDuration(getTrackDuration(track)), inline: true },
                        { name: 'Requested by', value: `${message.author}`, inline: true }
                    );
                const artwork = track.info?.artworkUrl || track.info?.thumbnail;
                if (artwork && /^https:\/\//i.test(artwork)) embed.setThumbnail(artwork);
                return message.reply({ embeds: [embed] });
            }

            const player = getPlayer(client, message.guild.id);
            if (!player) return message.reply('Nothing is playing right now. Use `%play <song name or URL>`.');
            const voice = await ensureSameVoiceChannel(message, player);
            if (!voice) return;

            if (cmd === 'pause') {
                if (player.paused) return message.reply('Music is already paused.');
                await player.pause();
                return sendNowPlaying(message, player, client, 'Paused');
            }
            if (cmd === 'resume') {
                if (!player.paused) return message.reply('Music is not paused.');
                await player.resume();
                return sendNowPlaying(message, player, client, 'Playing');
            }
            if (cmd === 'skip') {
                if (!player.queue.current) return message.reply('There is no current track to skip.');
                await player.skip();
                return message.reply('Skipped the current track.');
            }
            if (cmd === 'stop') {
                await player.stopPlaying(true);
                return message.reply('Playback stopped and the queue was cleared.');
            }
            if (cmd === 'nowplaying') return sendNowPlaying(message, player, client, player.paused ? 'Paused' : 'Playing');

            if (cmd === 'queue') {
                const current = player.queue.current;
                const upcoming = player.queue.tracks || [];
                const lines = upcoming.slice(0, 15).map((track, index) => {
                    const title = track.info?.title || track.title || 'Unknown track';
                    const duration = formatDuration(track.info?.duration ?? track.duration ?? 0);
                    return `**${index + 1}.** ${title} — \`${duration}\``;
                });
                const embed = new EmbedBuilder()
                    .setColor(COLOR)
                    .setTitle('SPARK MUSIC • Queue')
                    .setDescription(`**Now Playing:** ${current ? getTrackTitle(current) : 'Nothing'}\n\n${lines.join('\n') || 'No upcoming tracks.'}`)
                    .setFooter({ text: `${upcoming.length} upcoming track(s)` });
                return message.reply({ embeds: [embed] });
            }

            if (cmd === 'volume') {
                const volume = Number(input);
                if (!input || !Number.isInteger(volume) || volume < 1 || volume > 100) {
                    return message.reply('Usage: `%volume 1-100`');
                }
                await player.setVolume(volume);
                return message.reply(`Volume set to **${volume}%**.`);
            }

            if (cmd === 'loop') {
                const mode = input.toLowerCase();
                const modes = { off: 'off', song: 'track', track: 'track', queue: 'queue' };
                if (!modes[mode]) return message.reply('Usage: `%loop off`, `%loop song` or `%loop queue`');
                await player.setRepeatMode(modes[mode]);
                return message.reply(`Repeat mode set to **${mode}**.`);
            }

            if (cmd === 'shuffle') {
                if (!player.queue.tracks?.length) return message.reply('There are no upcoming tracks to shuffle.');
                await player.queue.shuffle();
                return message.reply('Shuffled the upcoming queue.');
            }

            if (cmd === 'remove') {
                const number = Number(input);
                if (!Number.isInteger(number) || number < 1 || number > player.queue.tracks.length) {
                    return message.reply('Usage: `%remove <queue number>`');
                }
                const removed = await player.queue.remove(number - 1);
                const track = removed?.removed?.[0];
                return message.reply(track ? `Removed **${getTrackTitle(track)}** from the queue.` : 'Could not remove that track.');
            }

            if (cmd === 'clear') {
                if (!player.queue.tracks?.length) return message.reply('The upcoming queue is already empty.');
                await player.queue.splice(0, player.queue.tracks.length);
                return message.reply('Cleared all upcoming tracks. Current track will keep playing.');
            }

            if (cmd === 'seek') {
                const match = input.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})$/) || input.match(/^(\d+):(\d{1,2})$/);
                if (!match) return message.reply('Usage: `%seek 1:30` or `%seek 1:02:15`');
                let seconds;
                if (match.length === 4) seconds = Number(match[1] || 0) * 3600 + Number(match[2]) * 60 + Number(match[3]);
                else seconds = Number(match[1]) * 60 + Number(match[2]);
                const duration = getTrackDuration(player.queue.current);
                if (!duration || seconds * 1000 >= duration) return message.reply('That timestamp is outside the current track.');
                await player.seek(seconds * 1000);
                return message.reply(`Seeked to **${formatDuration(seconds * 1000)}**.`);
            }
        } catch (error) {
            console.error(`[SPARK MUSIC] %${cmd} failed:`, error);
            const detail = /node|connect|available/i.test(error.message || '')
                ? 'The Lavalink server may be offline or still connecting.'
                : 'Check the Lavalink configuration and audio source.';
            return message.reply(`Music command failed. ${detail}`).catch(() => {});
        }
    });
};
