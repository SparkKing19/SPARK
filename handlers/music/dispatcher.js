let Music247, GuildConfig, CustomPlaylist;
try { 
    Music247 = require('../../models/music247'); 
} catch (_) { 
    try { Music247 = require('../../models/music'); } catch (_) { Music247 = null; }
}
try { GuildConfig = require('../../models/guildConfig'); } catch (_) { GuildConfig = null; }
try { CustomPlaylist = require('../../models/customPlaylist'); } catch (_) { CustomPlaylist = null; }

const { getPanelEmbed, getPanelComponents, updateVoiceStatus } = require('./panel');

class SongDispatcher {
    constructor(client, player, textChannel, guildId, voiceChannelId) {
        this.client = client;
        this.player = player;
        this.textChannel = textChannel;
        this.guildId = guildId;
        this.voiceChannelId = voiceChannelId;
        this.queue = [];
        this.current = null;
        this.previous = null;
        this.loop = 'NONE';
        this.autoplay = true;

        this.player.on('start', () => this.onTrackStart());
        this.player.on('end', () => this.onTrackEnd());
        this.player.on('exception', (err) => this.onTrackException(err));
        this.player.on('closed', () => this.destroy());
    }

    async play() {
        if (!this.player) return;
        
        if (!this.queue.length && !this.current) {
            return this.handleQueueEnd();
        }

        if (!this.current) {
            this.current = this.queue.shift();
        }

        if (!this.current) return this.handleQueueEnd();

        try {
            const trackString = this.current.encoded || this.current.track || (typeof this.current === 'string' ? this.current : null);

            if (!trackString) {
                console.error('Invalid track string:', this.current);
                return this.onTrackEnd();
            }

            await this.player.playTrack({ track: { encoded: trackString } });
        } catch (err) {
            console.error('Error executing playTrack:', err);
            await this.onTrackException(err);
        }
    }

    async onTrackStart() {
        if (!this.current) return;
        this.previous = this.current;

        if (this.voiceChannelId) {
            await updateVoiceStatus(
                this.client, 
                this.voiceChannelId, 
                `<a:play_rec:1559415361290641429> ${this.current.info?.title?.substring(0, 35) || 'Audio Stream'}`
            );
        }

        if (CustomPlaylist) {
            try {
                const activePlaylists = await CustomPlaylist.find({ recording: true });
                for (const pl of activePlaylists) {
                    if (pl.tracks.length < 10) {
                        pl.tracks.push({
                            title: this.current.info?.title || 'Unknown Title',
                            uri: this.current.info?.uri || '',
                            author: this.current.info?.author || 'Unknown Artist',
                            length: this.current.info?.length || 0
                        });
                        if (pl.tracks.length >= 10) pl.recording = false;
                        await pl.save();
                    }
                }
            } catch (_) {}
        }

        await this.updatePanel();
    }

    async onTrackEnd() {
        if (this.loop === 'TRACK' && this.previous) {
            this.queue.unshift(this.previous);
        } else if (this.loop === 'QUEUE' && this.previous) {
            this.queue.push(this.previous);
        }

        this.current = null;

        if (this.queue.length) {
            return this.play();
        }

        await this.handleQueueEnd();
    }

    async onTrackException(err) {
        console.error(`⚠️ Playback Exception in guild ${this.guildId}:`, err);
        this.current = null;
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
        if (this.voiceChannelId) {
            await updateVoiceStatus(this.client, this.voiceChannelId, '');
        }
        await this.updatePanel();

        const rec247 = Music247 ? await Music247.findOne({ guildId: this.guildId, enabled: true }).catch(() => null) : null;
        if (!rec247) {
            this.destroy();
        }
    }

    async resolveAutoplay(lastTrack) {
        try {
            const node = this.client.shoukaku?.getIdealNode();
            if (!node) return null;

            const query = `scsearch:${lastTrack.info?.author || ''} audio`;
            const result = await node.rest.resolve(query);

            const tracks = Array.isArray(result?.data) ? result.data : result?.data?.tracks;
            if (tracks?.length) {
                const filtered = tracks.filter(t => t.info?.title !== lastTrack.info?.title);
                const chosen = filtered.length ? filtered[Math.floor(Math.random() * Math.min(filtered.length, 5))] : tracks[0];
                if (chosen) {
                    chosen.info.requester = this.client.user;
                    return chosen;
                }
            }
        } catch (_) {}
        return null;
    }

    async updatePanel() {
        try {
            if (!GuildConfig) return;
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
            try {
                this.player.connection.disconnect();
            } catch (_) {}
        }
    }
}

module.exports = SongDispatcher;
                   
