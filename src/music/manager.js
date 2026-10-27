const store = require('./store');
const GuildPlayer = require('./Player');
const config = require('../config');
const db = require('../db');
const E = require('../emojis');
const { toTrack, link } = require('../util');

async function resolve(client, query, userId) {
  const node = client.shoukaku.getIdealNode();
  if (!node) return { type: 'error', tracks: [], message: 'Lavalink node is not connected.' };
  // Optional source prefix: "yt: song", "ytm: song", "sc: song", "sp: song", "am: song", "dz: song"
  const engines = { yt: 'ytsearch', ytm: 'ytmsearch', sc: 'scsearch', sp: 'spsearch', am: 'amsearch', dz: 'dzsearch' };
  const pm = query.match(/^(yt|ytm|sc|sp|am|dz):\s*(.+)$/i);
  const id = /^https?:\/\//i.test(query)
    ? query
    : pm ? `${engines[pm[1].toLowerCase()]}:${pm[2]}` : `${config.defaultSearch}:${query}`;
  const res = await node.rest.resolve(id);
  if (!res) return { type: 'empty', tracks: [] };
  switch (res.loadType) {
    case 'track': return { type: 'track', tracks: [toTrack(res.data, userId)] };
    case 'playlist': return { type: 'playlist', name: res.data.info.name, tracks: res.data.tracks.map((x) => toTrack(x, userId)) };
    case 'search': return { type: 'search', tracks: res.data.slice(0, 10).map((x) => toTrack(x, userId)) };
    case 'error': return { type: 'error', tracks: [], message: res.data?.message || 'Load failed.' };
    default: return { type: 'empty', tracks: [] };
  }
}

// Joins the user's voice channel and creates the GuildPlayer (or returns the existing one)
async function ensurePlayer(ctx) {
  const { client, message } = ctx;
  const existing = store.get(message.guild.id);
  if (existing) return existing;
  const vc = message.member.voice.channel;
  const me = message.guild.members.me;
  const perms = vc.permissionsFor(me);
  if (!perms.has(['ViewChannel', 'Connect', 'Speak'])) {
    await ctx.say(`${E('error')} I need **Connect** and **Speak** permissions in ${vc}.`);
    return null;
  }
  if (!client.shoukaku.getIdealNode()) {
    await ctx.say(`${E('error')} Lavalink node is not connected yet. Try again in a moment.`);
    return null;
  }
  try {
    const player = await client.shoukaku.joinVoiceChannel({
      guildId: message.guild.id, channelId: vc.id, shardId: message.guild.shardId, deaf: true
    });
    const gp = new GuildPlayer(client, message.guild.id, player, message.channel.id, vc.id);
    store.set(message.guild.id, gp);
    return gp;
  } catch (e) {
    await ctx.say(`${E('error')} Could not join the voice channel: ${e.message}`);
    return null;
  }
}

// Applies server limits and adds tracks. mode: queue | next | now
async function addTracks(ctx, tracks, mode = 'queue', playlistName = null) {
  const { gp, g } = ctx;
  let list = tracks;
  if (g.maxDuration) list = list.filter((t) => t.isStream || t.length <= g.maxDuration * 60000);
  if (g.allowedGenres.length) {
    list = list.filter((t) => g.allowedGenres.some((k) => `${t.title} ${t.author}`.toLowerCase().includes(k)));
  }
  if (!list.length) return ctx.say(`${E('error')} No track matched this server's limits (max duration / allowed genres).`);
  const room = g.maxQueue - gp.queue.length;
  if (room <= 0) return ctx.say(`${E('error')} Queue is full (${g.maxQueue} tracks).`);
  list = list.slice(0, room);

  const wasPlaying = !!gp.current;
  if (mode === 'now') {
    const [first, ...rest] = list;
    gp.queue.unshift(...rest);
    if (gp.current) gp.queue.splice(rest.length, 0, gp.current);
    gp.lastBatch = list;
    await gp.start(first, false);
    return ctx.say(`${E('play')} Playing now: ${link(first)}`);
  }
  gp.add(list, { next: mode === 'next' });
  if (playlistName) await ctx.say(`${E('queue')} Added **${list.length}** tracks from **${playlistName}**`);
  else if (list.length === 1) {
    await ctx.say(`${E('success')} ${wasPlaying ? `Queued (#${mode === 'next' ? 1 : gp.queue.length})` : 'Playing'}: ${link(list[0])}`);
  } else await ctx.say(`${E('queue')} Added **${list.length}** tracks to the queue`);
  await gp.kick(false);
}

async function playQuery(ctx, query, mode = 'queue') {
  const r = await resolve(ctx.client, query, ctx.message.author.id);
  if (r.type === 'error') return ctx.say(`${E('error')} ${r.message}`);
  if (!r.tracks.length) return ctx.say(`${E('error')} Nothing found for **${query}**.`);
  if (r.type === 'playlist') return addTracks(ctx, r.tracks, mode, r.name);
  return addTracks(ctx, [r.tracks[0]], mode);
}

module.exports = { resolve, ensurePlayer, addTracks, playQuery };
