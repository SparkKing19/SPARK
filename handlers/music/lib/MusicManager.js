'use strict';

const { EmbedBuilder } = require('discord.js');

class MusicManager {
  constructor(client, options = {}) {
    this.client = client;
    this.queues = new Map();
    this.defaultVolume = options.defaultVolume ?? 70;
    this.maxQueueSize = options.maxQueueSize ?? 500;
  }

  get(guildId) { return this.queues.get(guildId); }

  create(guildId, textChannelId, voiceChannelId) {
    let queue = this.get(guildId);
    if (!queue) {
      queue = {
        guildId, textChannelId, voiceChannelId, player: null,
        tracks: [], current: null, volume: this.defaultVolume,
        loop: 'off', paused: false, starting: false, lastPosition: 0
      };
      this.queues.set(guildId, queue);
    } else {
      queue.textChannelId = textChannelId;
      queue.voiceChannelId = voiceChannelId;
    }
    return queue;
  }

  async connect(message) {
    const voice = message.member?.voice?.channel;
    if (!voice) throw new Error('Join a voice channel first.');
    if (!this.client.shoukaku) throw new Error('Shoukaku is not attached to client.shoukaku.');

    const queue = this.create(message.guild.id, message.channel.id, voice.id);
    if (queue.player) {
      if (queue.voiceChannelId !== voice.id) throw new Error('I am already playing in another voice channel.');
      return queue;
    }

    const player = await this.client.shoukaku.joinVoiceChannel({
      guildId: message.guild.id,
      channelId: voice.id,
      shardId: message.guild.shardId ?? 0,
      deafened: true
    });

    queue.player = player;
    player.setGlobalVolume(queue.volume / 100);

    player.on('end', async (event) => {
      if (event?.reason === 'replaced') return;
      if (queue.loop === 'track' && queue.current) {
        queue.tracks.unshift(queue.current);
      } else if (queue.loop === 'queue' && queue.current) {
        queue.tracks.push(queue.current);
      }
      queue.current = null;
      queue.paused = false;
      await this.playNext(queue);
    });

    player.on('exception', (event) => {
      console.error('[music:track-exception]', event);
      this.send(queue, 'A track failed to play. Moving to the next track.');
      queue.current = null;
      this.playNext(queue).catch(console.error);
    });

    player.on('closed', (event) => {
      console.warn('[music:player-closed]', event);
    });

    return queue;
  }

  async resolve(query) {
    const nodes = this.client.shoukaku?.nodes;
    const node = nodes?.values?.().next?.().value;
    if (!node) throw new Error('No Lavalink node is connected.');

    let result;
    const isUrl = /^https?:\/\//i.test(query);
    const identifiers = isUrl ? [query] : [`ytsearch:${query}`, `scsearch:${query}`];

    for (const identifier of identifiers) {
      try {
        result = await node.rest.resolve(identifier);
        if (result?.data?.length || result?.tracks?.length || result?.encoded) break;
      } catch (_) { /* Try next source identifier. */ }
    }
    if (!result) throw new Error('No results. Check the Lavalink source plugins and query.');
    const loadType = result.loadType;
    const data = result.data ?? result.tracks ?? result;
    if (loadType === 'error' || loadType === 'empty') return { tracks: [], playlistName: null };

    if (loadType === 'playlist' && data?.tracks) {
      return {
        tracks: data.tracks.filter(t => t?.encoded || t?.track).map(t => this.normalizeTrack(t)),
        playlistName: data.info?.name ?? null
      };
    }
    const list = Array.isArray(data) ? data : (data ? [data] : []);
    return { tracks: list.filter(t => t?.encoded || t?.track).map(t => this.normalizeTrack(t)), playlistName: null };
  }

  normalizeTrack(track) {
    const info = track.info ?? track;
    return {
      encoded: track.encoded ?? track.track,
      title: info.title ?? 'Unknown title',
      uri: info.uri ?? info.url ?? null,
      identifier: info.identifier ?? null,
      author: info.author ?? 'Unknown artist',
      length: Number(info.length ?? info.duration ?? 0),
      artworkUrl: info.artworkUrl ?? info.artwork_url ?? null,
      requesterId: null,
      requesterTag: 'Unknown requester'
    };
  }

  async add(message, query) {
    const queue = await this.connect(message);
    const result = await this.resolve(query);
    if (!result.tracks.length) throw new Error('No playable tracks found for that search.');
    if (queue.tracks.length + result.tracks.length > this.maxQueueSize) {
      throw new Error(`Queue limit is ${this.maxQueueSize} tracks.`);
    }

    const tracks = result.tracks.map(track => ({
      ...track, requesterId: message.author.id,
      requesterTag: message.author.tag ?? message.author.username
    }));
    queue.tracks.push(...tracks);
    const count = tracks.length;
    if (!queue.current && !queue.starting) await this.playNext(queue);

    if (result.playlistName) {
      await message.reply(`Added **${count}** tracks from **${result.playlistName}** to the queue.`);
    } else if (count === 1) {
      await message.reply(`Added **${tracks[0].title}** to the queue.`);
    } else {
      await message.reply(`Added **${count}** tracks to the queue.`);
    }
    return queue;
  }

  async playNext(queue) {
    if (!queue?.player || queue.starting) return;
    const next = queue.tracks.shift();
    if (!next) {
      queue.current = null;
      this.send(queue, 'Queue finished. I am staying in voice for now; use `%leave` to disconnect.');
      return;
    }

    queue.starting = true;
    try {
      queue.current = next;
      queue.lastPosition = 0;
      await queue.player.playTrack({ track: { encoded: next.encoded } });
      queue.starting = false;
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('Now Playing')
        .setDescription(`[${next.title}](${next.uri || 'https://discord.com'})`)
        .addFields(
          { name: 'Artist', value: String(next.author).slice(0, 1024), inline: true },
          { name: 'Requested by', value: String(next.requesterTag).slice(0, 1024), inline: true }
        );
      if (next.artworkUrl) embed.setThumbnail(next.artworkUrl);
      this.send(queue, { embeds: [embed] });
    } catch (error) {
      queue.starting = false;
      console.error('[music:play-next]', error);
      queue.current = null;
      this.send(queue, 'Could not start that track; skipping it.');
      await this.playNext(queue);
    }
  }

  send(queue, payload) {
    const channel = this.client.channels?.cache?.get(queue?.textChannelId);
    if (channel?.isTextBased?.()) return channel.send(typeof payload === 'string' ? { content: payload } : payload).catch(() => null);
    return Promise.resolve(null);
  }

  async disconnect(guildId) {
    const queue = this.get(guildId);
    if (!queue) return;
    try {
      if (queue.player) await this.client.shoukaku.leaveVoiceChannel(guildId);
    } finally {
      this.queues.delete(guildId);
    }
  }

  formatTime(ms) {
    const sec = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  }

  ensureSameVoice(message, queue) {
    const voiceId = message.member?.voice?.channelId;
    if (!voiceId) throw new Error('Join my voice channel to use this command.');
    if (queue?.voiceChannelId && voiceId !== queue.voiceChannelId) throw new Error('You must be in my voice channel to use this command.');
  }
}

module.exports = MusicManager;
