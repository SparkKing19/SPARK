const WebSocket = require("ws");
const { EmbedBuilder } = require("discord.js");

const LAVALINK_URL = "http://127.0.0.1:2333";
const PASSWORD = process.env.LAVALINK_PASSWORD || "change-this-in-railway";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

class MusicManager {
  constructor(client) {
    this.client = client;
    this.ws = null;
    this.sessionId = null;
    this.ready = false;
    this.queues = new Map();
    this.voice = new Map();
    this.retry = 0;
  }

  async connect() {
    while (!this.ready) {
      try {
        await this.openSocket();
        return;
      } catch (error) {
        console.error("[LAVALINK] Connection failed:", error.message);
        await sleep(Math.min(5000 + this.retry++ * 3000, 30000));
      }
    }
  }

  openSocket() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket("ws://127.0.0.1:2333/v4/websocket", {
        headers: {
          Authorization: PASSWORD,
          "User-Id": this.client.user.id,
          "Client-Name": "SparkTune/1.0.0"
        }
      });
      const timeout = setTimeout(() => {
        ws.terminate();
        reject(new Error("Lavalink websocket timeout"));
      }, 15000);
      ws.once("open", () => console.log("[LAVALINK] WebSocket connected."));
      ws.on("message", raw => {
        let data;
        try { data = JSON.parse(raw.toString()); } catch { return; }
        if (data.op === "ready") {
          this.sessionId = data.sessionId;
          this.ready = true;
          this.retry = 0;
          clearTimeout(timeout);
          console.log(`[LAVALINK] Session ready: ${this.sessionId}`);
          resolve();
          for (const guildId of this.voice.keys()) this.syncVoice(guildId).catch(console.error);
        }
        if (data.op === "event") this.onEvent(data);
        if (data.op === "playerUpdate") {
          const q = this.queues.get(data.guildId);
          if (q) q.position = data.state?.position || 0;
        }
      });
      ws.on("error", error => {
        clearTimeout(timeout);
        if (!this.ready) reject(error);
      });
      ws.on("close", () => {
        this.ready = false;
        this.sessionId = null;
        console.warn("[LAVALINK] WebSocket closed; reconnecting.");
        setTimeout(() => this.connect(), 3000);
      });
      this.ws = ws;
    });
  }

  async request(path, method = "GET", body) {
    const response = await fetch(`${LAVALINK_URL}${path}`, {
      method,
      headers: {
        Authorization: PASSWORD,
        "Content-Type": "application/json"
      },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Lavalink ${response.status}: ${detail.slice(0, 250)}`);
    }
    if (response.status === 204) return null;
    return response.json();
  }

  queue(guildId) {
    if (!this.queues.has(guildId)) {
      this.queues.set(guildId, { tracks: [], current: null, textChannelId: null, voiceChannelId: null, position: 0, volume: 80, loop: "off" });
    }
    return this.queues.get(guildId);
  }

  async search(query) {
    if (!this.ready) throw new Error("Music engine is still starting. Try again in a few seconds.");
    const identifier = /^https?:\/\//i.test(query) ? query : `ytsearch:${query}`;
    const result = await this.request(`/v4/loadtracks?identifier=${encodeURIComponent(identifier)}`);
    if (result.loadType === "empty" || result.loadType === "error") {
      throw new Error(result.data?.message || "No playable tracks found.");
    }
    if (result.loadType === "playlist") return { tracks: result.data.tracks || [], name: result.data.info?.name };
    if (result.loadType === "search") return { tracks: (result.data || []).slice(0, 1) };
    return { tracks: result.data ? [result.data] : [] };
  }

  async enqueue(interaction, query) {
    const memberChannel = interaction.member.voice?.channel;
    if (!memberChannel) throw new Error("Join a voice channel first.");
    const q = this.queue(interaction.guildId);
    q.textChannelId = interaction.channelId;
    q.voiceChannelId = memberChannel.id;
    const results = await this.search(query);
    if (!results.tracks.length) throw new Error("No tracks found.");
    const botVoice = interaction.guild.members.me?.voice?.channelId;
    if (botVoice && botVoice !== memberChannel.id) throw new Error("I'm already playing in another voice channel.");
    const first = !q.current;
    q.tracks.push(...results.tracks);
    await this.ensureVoice(interaction.guildId, memberChannel.id);
    if (first) await this.playNext(interaction.guildId);
    return { count: results.tracks.length, title: results.tracks[0].info?.title || "Unknown track", playlist: results.name };
  }

  async ensureVoice(guildId, channelId) {
    const existing = this.voice.get(guildId);
    if (existing?.channelId === channelId) return;
    const guild = this.client.guilds.cache.get(guildId);
    this.voice.set(guildId, { channelId, sessionId: null, token: null, endpoint: null });
    await guild.members.me.voice.setChannel(channelId).catch(error => {
      throw new Error(`Could not join the voice channel: ${error.message}`);
    });
    await this.syncVoice(guildId);
  }

  async syncVoice(guildId) {
    if (!this.sessionId || !this.ready) return;
    const v = this.voice.get(guildId);
    if (!v || !v.sessionId || !v.token || !v.endpoint) return;
    await this.request(`/v4/sessions/${this.sessionId}/players/${guildId}?noReplace=false`, "PATCH", {
      voice: { sessionId: v.sessionId, token: v.token, endpoint: v.endpoint },
      volume: this.queue(guildId).volume
    });
  }

  async onVoiceState(data) {
    if (data.user_id === this.client.user.id) {
      const v = this.voice.get(data.guild_id) || {};
      if (data.session_id) v.sessionId = data.session_id;
      if (data.channel_id) v.channelId = data.channel_id;
      this.voice.set(data.guild_id, v);
      await this.syncVoice(data.guild_id).catch(console.error);
    }
  }

  async onVoiceServer(data) {
    const v = this.voice.get(data.guild_id) || {};
    v.token = data.token;
    v.endpoint = data.endpoint;
    this.voice.set(data.guild_id, v);
    await this.syncVoice(data.guild_id).catch(console.error);
  }

  async playNext(guildId) {
    const q = this.queue(guildId);
    if (q.loop === "track" && q.current) q.tracks.unshift(q.current);
    if (!q.tracks.length) {
      q.current = null;
      await this.request(`/v4/sessions/${this.sessionId}/players/${guildId}`, "PATCH", { track: { encoded: null } }).catch(() => {});
      return;
    }
    const track = q.tracks.shift();
    q.current = track;
    q.position = 0;
    await this.request(`/v4/sessions/${this.sessionId}/players/${guildId}?noReplace=false`, "PATCH", {
      track: { encoded: track.encoded },
      volume: q.volume,
      paused: false
    });
    const channel = this.client.channels.cache.get(q.textChannelId);
    if (channel) {
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle("🎶 Now Playing")
        .setDescription(`[${track.info.title}](${track.info.uri || "https://discord.com"})`)
        .addFields(
          { name: "Artist", value: track.info.author || "Unknown", inline: true },
          { name: "Duration", value: this.format(track.info.length), inline: true },
          { name: "Queue", value: `${q.tracks.length} track(s)`, inline: true }
        )
        .setThumbnail(track.info.artworkUrl || null);
      channel.send({ embeds: [embed] }).catch(() => {});
    }
  }

  onEvent(data) {
    if (data.type === "TrackEndEvent" && ["finished", "loadFailed", "stopped", "replaced"].includes(data.reason)) {
      const q = this.queues.get(data.guildId);
      if (!q) return;
      if (q.loop === "queue" && q.current) q.tracks.push(q.current);
      if (data.reason !== "replaced") this.playNext(data.guildId).catch(console.error);
    }
    if (data.type === "WebSocketClosedEvent") console.warn("[VOICE] Discord voice websocket closed:", data.reason);
  }

  async skip(guildId) {
    const q = this.queue(guildId);
    if (!q.current) throw new Error("Nothing is playing.");
    await this.request(`/v4/sessions/${this.sessionId}/players/${guildId}`, "PATCH", { track: { encoded: null } });
    await this.playNext(guildId);
  }

  async pause(guildId, paused) {
    await this.request(`/v4/sessions/${this.sessionId}/players/${guildId}`, "PATCH", { paused });
  }

  async stop(guildId) {
    const q = this.queue(guildId);
    q.tracks = []; q.current = null; q.loop = "off";
    await this.request(`/v4/sessions/${this.sessionId}/players/${guildId}`, "DELETE").catch(() => {});
    this.queues.delete(guildId);
    this.voice.delete(guildId);
    const guild = this.client.guilds.cache.get(guildId);
    await guild?.members.me?.voice.disconnect().catch(() => {});
  }

  async setVolume(guildId, volume) {
    const q = this.queue(guildId);
    q.volume = volume;
    await this.request(`/v4/sessions/${this.sessionId}/players/${guildId}`, "PATCH", { volume });
  }

  format(ms = 0) {
    const total = Math.floor(ms / 1000);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  }
}

module.exports = { MusicManager };