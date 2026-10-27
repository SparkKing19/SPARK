const store = require('./store');
const db = require('../db');
const E = require('../emojis');
const FILTERS = require('./filters');
const { t } = require('../lang');
const { embed, fmtTrack, toTrack } = require('../util');

class GuildPlayer {
  constructor(client, guildId, player, textChannelId, voiceChannelId) {
    this.client = client;
    this.guildId = guildId;
    this.player = player;
    this.textChannelId = textChannelId;
    this.voiceChannelId = voiceChannelId;

    this.queue = [];
    this.current = null;
    this.history = [];
    this.loop = 'off'; // off | track | queue
    this.autoplay = false;
    this.paused = false;
    this.muted = false;
    this.volume = this.settings.defaultVolume;
    this.filterName = null;
    this.eq = {};
    this.stopping = false;
    this.forceSkip = false;
    this.lastBatch = [];
    this.votes = new Set();
    this.idleTimer = null;
    this.emptyTimer = null;
    this.destroyed = false;

    player.on('end', (ev) => this.onEnd(ev).catch((e) => console.error('[player:end]', e)));
    player.on('exception', (ev) => this.say(`${E('error')} Track error: ${ev.exception?.message || 'unknown error'}`));
    player.on('stuck', () => player.stopTrack().catch(() => {}));
    player.on('closed', () => this.destroy(false));

    player.setGlobalVolume(this.volume).catch(() => {});
    const f = this.settings.defaultFilter;
    if (f && FILTERS[f]) this.applyFilter(f).catch(() => {});
    this.startIdleTimer();
  }

  get settings() { return db.guild(this.guildId); }
  get position() { return this.player.position || 0; }

  say(text, title) {
    const ch = this.client.channels.cache.get(this.textChannelId);
    return ch?.send({ embeds: [embed(text, title)] }).catch(() => {});
  }

  npEmbed(track = this.current) {
    const e = embed(`${E('music')} **[${track.title}](${track.uri})**\nby ${track.author}`, t(this.settings.language, 'nowPlaying'))
      .addFields(
        { name: 'Duration', value: fmtTrack(track), inline: true },
        { name: 'Requested by', value: track.requester ? `<@${track.requester}>` : 'Autoplay', inline: true },
        { name: 'Volume', value: `${this.volume}%`, inline: true }
      );
    if (track.artwork) e.setThumbnail(track.artwork);
    return e;
  }

  add(tracks, { next = false } = {}) {
    if (next) this.queue.unshift(...tracks);
    else this.queue.push(...tracks);
    this.lastBatch = tracks;
  }

  async kick(announce = false) {
    if (this.current) return;
    const next = this.queue.shift();
    if (next) await this.start(next, announce);
  }

  async start(track, announce = true) {
    clearTimeout(this.idleTimer);
    this.current = track;
    this.votes.clear();
    this.paused = false;
    try {
      await this.player.playTrack({ track: { encoded: track.encoded } });
    } catch (e) {
      this.say(`${E('error')} Could not play **${track.title}**: ${e.message}`);
      return this.onEnd({ reason: 'loadFailed' });
    }
    db.addPlay(this.guildId, track);
    if (announce && this.settings.announce) {
      this.client.channels.cache.get(this.textChannelId)?.send({ embeds: [this.npEmbed(track)] }).catch(() => {});
    }
  }

  async onEnd(ev) {
    if (this.destroyed || ev.reason === 'replaced') return;
    const finished = this.current;
    if (this.stopping) {
      this.stopping = false;
      this.current = null;
      this.paused = false;
      return this.idle(false);
    }
    if (ev.reason === 'loadFailed') this.forceSkip = true;
    if (finished) {
      this.history.unshift(finished);
      if (this.history.length > 50) this.history.length = 50;
    }

    let next = null;
    if (this.loop === 'track' && !this.forceSkip && finished) next = finished;
    else {
      if (this.loop === 'queue' && finished) this.queue.push(finished);
      next = this.queue.shift();
    }
    this.forceSkip = false;

    if (!next && this.autoplay && finished) next = await this.getAutoplay(finished);
    if (!next) {
      this.current = null;
      return this.idle(true);
    }
    await this.start(next, true);
  }

  idle(announce) {
    if (announce) this.say(t(this.settings.language, 'ended'));
    this.startIdleTimer();
  }

  startIdleTimer() {
    clearTimeout(this.idleTimer);
    const g = this.settings;
    if (g.twentyFourSeven || !g.autoLeave) return;
    this.idleTimer = setTimeout(() => {
      if (!this.current) this.destroy();
    }, 120000);
  }

  async getAutoplay(last) {
    try {
      const node = this.client.shoukaku.getIdealNode();
      let res;
      if (/youtu/.test(last.uri || '')) {
        res = await node.rest.resolve(`https://www.youtube.com/watch?v=${last.identifier}&list=RD${last.identifier}`);
      }
      if (!res || res.loadType !== 'playlist') res = await node.rest.resolve(`ytsearch:${last.author} mix`);
      const list = res.loadType === 'playlist' ? res.data.tracks : res.loadType === 'search' ? res.data : [];
      const seen = new Set([last.uri, ...this.history.map((h) => h.uri)]);
      const pick = list.find((x) => !seen.has(x.info.uri));
      return pick ? toTrack(pick, null) : null;
    } catch {
      return null;
    }
  }

  async setPaused(v) { await this.player.setPaused(v); this.paused = v; }

  setVolume(v) {
    this.volume = v;
    if (!this.muted) return this.player.setGlobalVolume(v);
  }

  async toggleMute() {
    this.muted = !this.muted;
    await this.player.setGlobalVolume(this.muted ? 0 : this.volume);
    return this.muted;
  }

  async applyFilter(name) {
    if (!name) {
      await this.player.clearFilters();
      this.filterName = null;
      this.eq = {};
      return;
    }
    await this.player.setFilters(FILTERS[name]);
    this.filterName = name;
  }

  async skip() {
    if (!this.current) return false;
    this.forceSkip = true;
    await this.player.stopTrack();
    return true;
  }

  async stop() {
    this.queue = [];
    if (this.current) {
      this.stopping = true;
      await this.player.stopTrack();
    }
  }

  destroy(leave = true) {
    if (this.destroyed) return;
    this.destroyed = true;
    clearTimeout(this.idleTimer);
    clearTimeout(this.emptyTimer);
    store.delete(this.guildId);
    if (leave) Promise.resolve(this.client.shoukaku.leaveVoiceChannel(this.guildId)).catch(() => {});
  }
}

module.exports = GuildPlayer;
