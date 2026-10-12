const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const BRAND = 'SPARK MUSIC';
const COLOR = 0x5865F2;

function formatDuration(ms) {
    if (!Number.isFinite(ms) || ms < 0) return 'LIVE';
    const total = Math.floor(ms / 1000);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return hours > 0
        ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
        : `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function progressBar(position, duration, size = 16) {
    if (!Number.isFinite(duration) || duration <= 0) return '🔴 LIVE';
    const ratio = Math.max(0, Math.min(1, position / duration));
    const filled = Math.min(size, Math.floor(ratio * size));
    return `${'▬'.repeat(filled)}🔘${'▬'.repeat(Math.max(0, size - filled))}`;
}

function getTrackTitle(track) {
    return track?.info?.title || track?.title || 'Unknown title';
}

function getTrackAuthor(track) {
    return track?.info?.author || track?.author || 'Unknown artist';
}

function getTrackUri(track) {
    return track?.info?.uri || track?.uri || null;
}

function getTrackDuration(track) {
    if (track?.info?.isStream || track?.isStream) return null;
    return track?.info?.duration ?? track?.duration ?? 0;
}

function getTrackArtwork(track) {
    const info = track?.info || track || {};
    if (info.artworkUrl) return info.artworkUrl;
    if (info.thumbnail) return info.thumbnail;
    const identifier = info.identifier;
    const source = String(info.sourceName || '').toLowerCase();
    if (identifier && source.includes('youtube')) return `https://img.youtube.com/vi/${identifier}/hqdefault.jpg`;
    return null;
}

function makePlayerEmbed(player, client, status = 'Now Playing') {
    const track = player?.queue?.current;
    const duration = getTrackDuration(track);
    const position = Number(player?.position || player?.lastPosition || 0);
    const embed = new EmbedBuilder()
        .setColor(COLOR)
        .setAuthor({ name: BRAND, iconURL: client.user.displayAvatarURL() })
        .setTitle(track ? getTrackTitle(track) : 'Nothing is playing')
        .setDescription(track
            ? `[${getTrackAuthor(track)}](${getTrackUri(track) || 'https://discord.com'})\n\n${progressBar(position, duration)}\n
en ${formatDuration(position)} / ${formatDuration(duration)}`
            : 'Use `%play <song name or URL>` to start listening.')
        .addFields(
            { name: 'Status', value: `\`${status}\``, inline: true },
            { name: 'Volume', value: `\`${player?.volume ?? 100}%\``, inline: true },
            { name: 'Queue', value: `\`${player?.queue?.tracks?.length ?? 0} song(s)\``, inline: true }
        )
        .setFooter({ text: 'SPARK Music • Prefix: %' })
        .setTimestamp();

    const artwork = getTrackArtwork(track);
    if (artwork && /^https:\/\//i.test(artwork)) embed.setThumbnail(artwork);
    return embed;
}

function makePlayerButtons(player) {
    const paused = Boolean(player?.paused);
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('spark_music_previous').setEmoji('⏮️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('spark_music_pause_resume').setEmoji(paused ? '▶️' : '⏸️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('spark_music_skip').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('spark_music_stop').setEmoji('⏹️').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('spark_music_loop').setEmoji('🔁').setStyle(ButtonStyle.Secondary)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('spark_music_volume_down').setLabel('Vol −').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('spark_music_queue').setLabel('Queue').setEmoji('📜').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('spark_music_volume_up').setLabel('Vol +').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('spark_music_refresh').setLabel('Refresh').setEmoji('🔄').setStyle(ButtonStyle.Secondary)
    );
    return [row1, row2];
}

module.exports = {
    BRAND,
    COLOR,
    formatDuration,
    progressBar,
    getTrackTitle,
    getTrackAuthor,
    getTrackUri,
    getTrackDuration,
    getTrackArtwork,
    makePlayerEmbed,
    makePlayerButtons
};
