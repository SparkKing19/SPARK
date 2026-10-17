const Music247 = require('../../models/music247');
const GuildConfig = require('../../models/guildConfig');
const CustomPlaylist = require('../../models/customPlaylist');
const { getPanelEmbed, getPanelComponents, updateVoiceStatus } = require('./panel');

class SongDispatcher {
    constructor(client, player, textChannel, guildId) {
        this.client = client;
        this.player = player;
        this.textChannel = textChannel;
        this.guildId = guildId;
        this.queue = [];
        this.current = null;
        this.previous = null;
        this.loop = 'NONE'; // NONE, TRACK, QUEUE
        this.autoplay = true;

        this.player.on('start', () => this.onTrackStart());
        this.player.on('end', () => this.onTrackEnd());
        this.player.on('exception', (err) => this.onTrackException(err));
        this.player.on('closed', () => this.destroy());
    }

    async play() {
        if (!this.player) return;
        if (!this.queue.length) {
            return this.handleQueueEnd();
        }

        this.current = this.queue.shift();
        await this.player.playTrack({ track: { encoded: this.current.encoded } });
    }

    async onTrackStart() {
        if (!this.current) return;
        this.previous = this.current;

        await updateVoiceStatus(
            this.client, 
            this.player.connection.channelId, 
            `<a:play_rec:1559415361290641429> ${this.current.info.title.substring(0, 35)}`
        );

        // Record Custom Playlist
        try {
            const activePlaylists = await CustomPlaylist.find({ recording: true });
            for (const pl of activePlaylists) {
                if (pl.tracks.length < 10) {
                    pl.tracks.push({
                        title: this.current.info.title,
                        uri: this.current.info.uri,
                        author: this.current.info.author,
                        length: this.current.info.length
                    });
                    if (pl.tracks.length >= 10) pl.recording = false;
                    await pl.save();
                }
            }
        } catch (_) {}

        await this.updatePanel();
    }

    async onTrackEnd() {
        if (this.loop === 'TRACK' && this.current) {
            this.queue.unshift(this.current);
        } else if (this.loop === 'QUEUE' && this.current) {
            this.queue.push(this.current);
        }

        if (this.queue.length) {
            return this.play();
        }

        await this.handleQueueEnd();
    }

    async onTrackException(err) {
        console.error(`⚠️ Playback Exception in guild ${this.guildId}:`, err);
        if (this.queue.length) {
            await this.play();
        } else {
            await this.handleQueueEnd();
        }
    }

    async handleQueueEnd() {
        if (this.autoplay && this.previous) {
            const nextTrack = await this.resolveAutoplay(this.previous);
            if (nextTrack) {
                this.queue.push(nextTrack);
                return this.play();
            }
        }

        this.current = null;
        await updateVoiceStatus(this.client, this.player.connection.channelId, '');
        await this.updatePanel();

        const rec247 = await Music247.findOne({ guildId: this.guildId, enabled: true });
        if (!rec247) {
            this.destroy();
        }
    }

    async resolveAutoplay(lastTrack) {
        try {
            const node = this.client.shoukaku.getIdealNode();
            if (!node) return null;

            const query = `scsearch:${lastTrack.info.author} audio`;
            const result = await node.rest.resolve(query);

            if (result?.data?.length) {
                const filtered = result.data.filter(t => t.info.title !== lastTrack.info.title);
                return filtered.length ? filtered[Math.floor(Math.random() * Math.min(filtered.length, 5))] : result.data[0];
            }
        } catch (_) {}
        return null;
    }

    async updatePanel() {
        try {
            const conf = await GuildConfig.findOne({ guildId: this.guildId });
            if (!conf || !conf.panelChannelId || !conf.panelMessageId) return;

            const channel = this.client.channels.cache.get(conf.panelChannelId);
            if (!channel) return;

            const msg = await channel.messages.fetch(conf.panelMessageId).catch(() => null);
            if (!msg) return;

            await msg.edit({
                embeds: [getPanelEmbed(this.client, this, this.current)],
                components: getPanelComponents(this)
            });
        } catch (_) {}
    }

    setFilter(filterName) {
        if (!this.player) return;

        if (filterName === 'f_bass') {
            this.player.setFilters({ equalizer: [{ band: 0, gain: 0.35 }, { band: 1, gain: 0.25 }, { band: 2, gain: 0.15 }] });
        } else if (filterName === 'f_ultrabass') {
            this.player.setFilters({ equalizer: [{ band: 0, gain: 0.60 }, { band: 1, gain: 0.50 }, { band: 2, gain: 0.35 }] });
        } else if (filterName === 'f_nightcore') {
            this.player.setFilters({ timescale: { speed: 1.25, pitch: 1.25, rate: 1.0 } });
        } else if (filterName === 'f_vaporwave') {
            this.player.setFilters({ timescale: { speed: 0.85, pitch: 0.80, rate: 1.0 } });
        } else if (filterName === 'f_8d') {
            this.player.setFilters({ rotation: { rotationHz: 0.2 } });
        } else if (filterName === 'f_pop') {
            this.player.setFilters({ equalizer: [{ band: 1, gain: 0.2 }, { band: 2, gain: 0.3 }, { band: 3, gain: 0.1 }] });
        } else if (filterName === 'f_soft') {
            this.player.setFilters({ lowPass: { smoothing: 20.0 } });
        } else if (filterName === 'f_treblebass') {
            this.player.setFilters({ equalizer: [{ band: 0, gain: 0.3 }, { band: 12, gain: 0.3 }, { band: 13, gain: 0.35 }] });
        } else if (filterName === 'f_electronic') {
            this.player.setFilters({ equalizer: [{ band: 0, gain: 0.35 }, { band: 5, gain: 0.25 }, { band: 13, gain: 0.3 }] });
        } else if (filterName === 'f_karaoke') {
            this.player.setFilters({ karaoke: { level: 1.0, monoLevel: 1.0, filterBand: 220.0, filterWidth: 100.0 } });
        } else if (filterName === 'f_slowed') {
            this.player.setFilters({ timescale: { speed: 0.75, pitch: 0.85, rate: 1.0 } });
        } else if (filterName === 'f_clear') {
            this.player.setFilters({});
        }
    }

    destroy() {
        this.queue = [];
        this.current = null;
        if (this.client.musicQueue) {
            this.client.musicQueue.delete(this.guildId);
        }
        if (this.player) {
            this.player.connection.disconnect();
        }
    }
}

module.exports = SongDispatcher;
