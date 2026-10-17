const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');

async function updateVoiceStatus(client, channelId, statusText = '') {
    if (!channelId) return;
    try {
        const channel = client.channels.cache.get(channelId);
        if (channel && typeof channel.setStatus === 'function') {
            await channel.setStatus(statusText).catch(() => {});
        } else {
            await client.rest.put(`/channels/${channelId}/voice-status`, {
                body: { status: statusText }
            }).catch(() => {});
        }
    } catch (_) {}
}

function getTrackThumbnail(track) {
    if (track?.info?.artworkUrl?.startsWith('http')) return track.info.artworkUrl;
    if (track?.info?.image?.startsWith('http')) return track.info.image;
    return 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=1000&auto=format&fit=crop';
}

function getPanelComponents(dispatcher = null) {
    const isLoop = dispatcher ? dispatcher.loop === 'TRACK' : false;
    const isAutoplay = dispatcher ? dispatcher.autoplay : true;
    const hasTrack = Boolean(dispatcher && dispatcher.current);

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_pause').setEmoji('⏸️').setStyle(ButtonStyle.Secondary).setDisabled(!hasTrack),
        new ButtonBuilder().setCustomId('btn_previous').setEmoji('⏮️').setStyle(ButtonStyle.Secondary).setDisabled(!hasTrack),
        new ButtonBuilder().setCustomId('btn_stop').setEmoji('🛑').setStyle(ButtonStyle.Danger).setDisabled(!hasTrack),
        new ButtonBuilder().setCustomId('btn_next').setEmoji('⏯️').setStyle(ButtonStyle.Secondary).setDisabled(!hasTrack),
        new ButtonBuilder().setCustomId('btn_resume').setEmoji('▶️').setStyle(ButtonStyle.Success).setDisabled(!hasTrack)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_loop_track').setEmoji('♾️').setStyle(isLoop ? ButtonStyle.Primary : ButtonStyle.Secondary).setDisabled(!hasTrack),
        new ButtonBuilder().setCustomId('btn_voldown').setEmoji('🔉').setStyle(ButtonStyle.Secondary).setDisabled(!hasTrack),
        new ButtonBuilder().setCustomId('btn_autoplay').setEmoji('🔁').setStyle(isAutoplay ? ButtonStyle.Primary : ButtonStyle.Secondary).setDisabled(!hasTrack),
        new ButtonBuilder().setCustomId('btn_volup').setEmoji('🔊').setStyle(ButtonStyle.Secondary).setDisabled(!hasTrack),
        new ButtonBuilder().setCustomId('btn_save_playlist').setEmoji('💾').setStyle(ButtonStyle.Secondary).setDisabled(!hasTrack)
    );

    const row3 = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('menu_filters')
            .setPlaceholder('Select an audio filter...')
            .setDisabled(!hasTrack)
            .addOptions([
                { label: 'Bassboost', description: 'Deep low-end frequencies', value: 'f_bass', emoji: '🔊' },
                { label: 'Ultra Bass', description: 'Maximum bass amplification', value: 'f_ultrabass', emoji: '💥' },
                { label: 'Nightcore', description: 'Higher tempo & pitch', value: 'f_nightcore', emoji: '⚡' },
                { label: 'Vaporwave', description: 'Slowed down aesthetic lo-fi', value: 'f_vaporwave', emoji: '🌊' },
                { label: '8D Audio', description: 'Surround 360 rotating effect', value: 'f_8d', emoji: '🎧' },
                { label: 'Pop', description: 'Crisp vocal clarity profile', value: 'f_pop', emoji: '🎤' },
                { label: 'Soft', description: 'Calm and relaxing curve', value: 'f_soft', emoji: '🍃' },
                { label: 'Treblebass', description: 'Enhanced highs and lows', value: 'f_treblebass', emoji: '🎚️' },
                { label: 'Electronic', description: 'Aggressive EDM frequency response', value: 'f_electronic', emoji: '⚡' },
                { label: 'Karaoke', description: 'Suppress center vocal channel', value: 'f_karaoke', emoji: '🎙️' },
                { label: 'Slowed', description: 'Deep slowed atmospheric playback', value: 'f_slowed', emoji: '⏳' },
                { label: 'Clear Filters', description: 'Reset all equalizers & effects', value: 'f_clear', emoji: '❌' }
            ])
    );

    return [row1, row2, row3];
}

function getPanelEmbed(client, dispatcher = null, track = null) {
    if (!dispatcher || !track) {
        return new EmbedBuilder()
            .setColor('#2B2D31')
            .setTitle('🎶 SparkCore Music Control Panel')
            .setDescription('**No song is currently playing.**\nJoin a voice channel and type `%play <song name or link>` to begin.')
            .setImage('https://dummyimage.com/1280x360/1e1f22/7289da&text=SparkCore+Audio+Engine+Ready')
            .setFooter({ text: 'SparkCore Music System • Standby' });
    }

    const duration = track.info.isStream ? 'LIVE' : new Date(track.info.length).toISOString().substr(14, 5);
    const isAutoplay = dispatcher.autoplay ? 'Enabled' : 'Disabled';
    const thumbnail = getTrackThumbnail(track);
    const source = (track.info.sourceName || 'Audio').toUpperCase();

    return new EmbedBuilder()
        .setColor('#5865F2')
        .setDescription(`## <a:play_rec:1559415361290641429> Now Playing...\n\n[**${track.info.title}**](${track.info.uri})\n\n> **Author:** \`${track.info.author}\` • **Source:** \`${source}\`\n> **Duration:** \`${duration}\`\n> **Autoplay:** \`${isAutoplay}\` • **Loop:** \`${dispatcher.loop}\`\n> **Voice Channel:** <#${dispatcher.voiceChannelId}>`)
        .setImage(thumbnail)
        .setFooter({ text: `Requested by ${track.info.requester?.username || 'User'}` });
}

module.exports = {
    updateVoiceStatus,
    getTrackThumbnail,
    getPanelComponents,
    getPanelEmbed
};
