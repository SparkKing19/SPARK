const E = require('../emojis');
const db = require('../db');
const { embed, fmt, link, paginate, shuffle, slim } = require('../util');
const { resolve, addTracks } = require('../music/manager');

const C = 'Playlists';
const MAX_PLAYLISTS = 25, MAX_TRACKS = 200, MAX_LIKED = 500;
const usage = (ctx, cmd, args) => ctx.say(`${E('error')} Usage: \`${ctx.prefix}${cmd} ${args}\``);

// returns { u, key, pl } or sends an error
function getPl(ctx, cmd, args = '<name>') {
  const key = ctx.args[0]?.toLowerCase();
  if (!key) { usage(ctx, cmd, args); return null; }
  const u = db.user(ctx.message.author.id);
  const pl = u.playlists[key];
  if (!pl) { ctx.say(`${E('error')} You have no playlist named **${key}**.`); return null; }
  return { u, key, pl };
}
const withRequester = (ctx, list) => list.map((t) => ({ ...t, requester: ctx.message.author.id }));

module.exports = [
  {
    name: 'playlist-create', aliases: ['plcreate'], category: C, usage: '<name>', description: 'Create a playlist',
    async run(ctx) {
      const key = ctx.args[0]?.toLowerCase();
      if (!key) return usage(ctx, 'playlist-create', '<name>');
      if (key.length > 32) return ctx.say(`${E('error')} Name too long (max 32).`);
      const u = db.user(ctx.message.author.id);
      if (u.playlists[key]) return ctx.say(`${E('error')} Playlist **${key}** already exists.`);
      if (Object.keys(u.playlists).length >= MAX_PLAYLISTS) return ctx.say(`${E('error')} Max ${MAX_PLAYLISTS} playlists.`);
      u.playlists[key] = [];
      db.save();
      ctx.say(`${E('success')} Created playlist **${key}**.`);
    }
  },
  {
    name: 'playlist-add', aliases: ['pladd'], category: C, usage: '<name> [song/url]', description: 'Add the current song (or a search/url) to a playlist',
    async run(ctx) {
      const r = getPl(ctx, 'playlist-add', '<name> [song/url]');
      if (!r) return;
      const query = ctx.args.slice(1).join(' ');
      let tracks;
      if (query) {
        const res = await resolve(ctx.client, query, ctx.message.author.id);
        if (res.type === 'error') return ctx.say(`${E('error')} ${res.message}`);
        if (!res.tracks.length) return ctx.say(`${E('error')} Nothing found.`);
        tracks = res.type === 'playlist' ? res.tracks : [res.tracks[0]];
      } else if (ctx.gp?.current) tracks = [ctx.gp.current];
      else return ctx.say(`${E('error')} Nothing is playing — give a song name or url.`);
      const room = MAX_TRACKS - r.pl.length;
      if (room <= 0) return ctx.say(`${E('error')} Playlist is full (${MAX_TRACKS}).`);
      const add = tracks.slice(0, room).map(slim);
      r.pl.push(...add);
      db.save();
      ctx.say(`${E('success')} Added **${add.length}** track(s) to **${r.key}** (${r.pl.length} total).`);
    }
  },
  {
    name: 'playlist-remove', aliases: ['plremove'], category: C, usage: '<name> <index>', description: 'Remove a track from a playlist',
    async run(ctx) {
      const r = getPl(ctx, 'playlist-remove', '<name> <index>');
      if (!r) return;
      const n = parseInt(ctx.args[1], 10);
      if (!(n >= 1 && n <= r.pl.length)) return usage(ctx, 'playlist-remove', '<name> <index>');
      const [t] = r.pl.splice(n - 1, 1);
      db.save();
      ctx.say(`${E('success')} Removed **${t.title}** from **${r.key}**.`);
    }
  },
  {
    name: 'playlist-play', aliases: ['plplay'], category: C, usage: '<name>', description: 'Queue a playlist', voice: true, create: true,
    async run(ctx) {
      const key = ctx.args[0]?.toLowerCase();
      if (!key) return usage(ctx, 'playlist-play', '<name>');
      const pl = db.user(ctx.message.author.id).playlists[key];
      if (!pl) return ctx.say(`${E('error')} You have no playlist named **${key}**.`);
      if (!pl.length) return ctx.say(`${E('error')} Playlist is empty.`);
      await addTracks(ctx, withRequester(ctx, pl), 'queue', key);
    }
  },
  {
    name: 'playlist-list', aliases: ['pllist', 'playlists'], category: C, description: 'List your playlists',
    async run(ctx) {
      const u = db.user(ctx.message.author.id);
      const names = Object.keys(u.playlists);
      if (!names.length) return ctx.say('You have no playlists. Create one with `playlist-create <name>`.');
      ctx.send({
        embeds: [embed(names.map((n) => `• **${n}** — ${u.playlists[n].length} tracks`).join('\n'), `${E('queue')} Your playlists`)]
      });
    }
  },
  {
    name: 'playlist-delete', aliases: ['pldelete'], category: C, usage: '<name>', description: 'Delete a playlist',
    async run(ctx) {
      const r = getPl(ctx, 'playlist-delete');
      if (!r) return;
      delete r.u.playlists[r.key];
      db.save();
      ctx.say(`${E('success')} Deleted playlist **${r.key}**.`);
    }
  },
  {
    name: 'playlist-rename', aliases: ['plrename'], category: C, usage: '<old> <new>', description: 'Rename a playlist',
    async run(ctx) {
      const r = getPl(ctx, 'playlist-rename', '<old> <new>');
      if (!r) return;
      const nu = ctx.args[1]?.toLowerCase();
      if (!nu || nu.length > 32) return usage(ctx, 'playlist-rename', '<old> <new>');
      if (r.u.playlists[nu]) return ctx.say(`${E('error')} **${nu}** already exists.`);
      r.u.playlists[nu] = r.pl;
      delete r.u.playlists[r.key];
      db.save();
      ctx.say(`${E('success')} Renamed **${r.key}** → **${nu}**.`);
    }
  },
  {
    name: 'playlist-view', aliases: ['plview'], category: C, usage: '<name> [page]', description: 'Show tracks in a playlist',
    async run(ctx) {
      const r = getPl(ctx, 'playlist-view', '<name> [page]');
      if (!r) return;
      const { items, page, pages, offset } = paginate(r.pl, parseInt(ctx.args[1], 10) || 1);
      const total = r.pl.reduce((a, t) => a + (t.isStream ? 0 : t.length), 0);
      ctx.send({
        embeds: [embed(items.map((t, i) => `**${offset + i + 1}.** ${link(t)}`).join('\n') || '_Empty_', `${E('queue')} ${r.key}`)
          .setFooter({ text: `Page ${page}/${pages} • ${r.pl.length} tracks • ${fmt(total)}` })]
      });
    }
  },
  {
    name: 'playlist-shuffle', aliases: ['plshuffle'], category: C, usage: '<name>', description: 'Shuffle the saved order of a playlist',
    async run(ctx) {
      const r = getPl(ctx, 'playlist-shuffle');
      if (!r) return;
      shuffle(r.pl);
      db.save();
      ctx.say(`${E('shuffle')} Shuffled **${r.key}**.`);
    }
  },
  {
    name: 'playlist-import', aliases: ['plimport'], category: C, usage: '<name> <playlist url>', description: 'Import a playlist from a url',
    async run(ctx) {
      const r = getPl(ctx, 'playlist-import', '<name> <playlist url>');
      if (!r) return;
      const url = ctx.args[1];
      if (!/^https?:\/\//i.test(url || '')) return usage(ctx, 'playlist-import', '<name> <playlist url>');
      const res = await resolve(ctx.client, url, ctx.message.author.id);
      if (res.type === 'error') return ctx.say(`${E('error')} ${res.message}`);
      if (!res.tracks.length) return ctx.say(`${E('error')} Nothing found at that url.`);
      const room = MAX_TRACKS - r.pl.length;
      if (room <= 0) return ctx.say(`${E('error')} Playlist is full (${MAX_TRACKS}).`);
      const add = res.tracks.slice(0, room).map(slim);
      r.pl.push(...add);
      db.save();
      ctx.say(`${E('success')} Imported **${add.length}** track(s) into **${r.key}**.`);
    }
  },
  {
    name: 'playlist-share', aliases: ['plshare'], category: C, usage: '<name> @user', description: 'Copy a playlist to another user',
    async run(ctx) {
      const r = getPl(ctx, 'playlist-share', '<name> @user');
      if (!r) return;
      const target = ctx.message.mentions.users.first();
      if (!target || target.bot || target.id === ctx.message.author.id) return usage(ctx, 'playlist-share', '<name> @user');
      const tu = db.user(target.id);
      if (Object.keys(tu.playlists).length >= MAX_PLAYLISTS) return ctx.say(`${E('error')} ${target.username} has too many playlists.`);
      let name = r.key;
      while (tu.playlists[name]) name += '_';
      tu.playlists[name] = structuredClone(r.pl);
      db.save();
      ctx.say(`${E('success')} Shared **${r.key}** with ${target} (saved as **${name}**).`);
    }
  },
  {
    name: 'like', aliases: ['love'], category: C, description: 'Add the current song to your liked songs', player: true, track: true,
    async run(ctx) {
      const u = db.user(ctx.message.author.id);
      const cur = ctx.gp.current;
      if (u.liked.some((t) => t.uri === cur.uri)) return ctx.say('Already in your liked songs.');
      if (u.liked.length >= MAX_LIKED) return ctx.say(`${E('error')} Liked songs are full (${MAX_LIKED}).`);
      u.liked.push(slim(cur));
      db.save();
      ctx.say(`${E('like')} Liked ${link(cur)}`);
    }
  },
  {
    name: 'unlike', category: C, usage: '[index]', description: 'Remove a song from your liked songs',
    async run(ctx) {
      const u = db.user(ctx.message.author.id);
      let i = parseInt(ctx.args[0], 10) - 1;
      if (Number.isNaN(i)) i = ctx.gp?.current ? u.liked.findIndex((t) => t.uri === ctx.gp.current.uri) : -1;
      if (i < 0 || i >= u.liked.length) return usage(ctx, 'unlike', '[index]');
      const [t] = u.liked.splice(i, 1);
      db.save();
      ctx.say(`${E('success')} Removed **${t.title}** from liked songs.`);
    }
  },
  {
    name: 'liked', aliases: ['likes'], category: C, usage: '[page]', description: 'Show your liked songs',
    async run(ctx) {
      const u = db.user(ctx.message.author.id);
      const { items, page, pages, offset } = paginate(u.liked, parseInt(ctx.args[0], 10) || 1);
      if (!items.length) return ctx.say('No liked songs yet. Use `like` while a song plays.');
      ctx.send({
        embeds: [embed(items.map((t, i) => `**${offset + i + 1}.** ${link(t)}`).join('\n'), `${E('like')} Liked songs`)
          .setFooter({ text: `Page ${page}/${pages} • ${u.liked.length} songs` })]
      });
    }
  },
  {
    name: 'playliked', aliases: ['pl-liked'], category: C, description: 'Queue all your liked songs', voice: true, create: true,
    async run(ctx) {
      const u = db.user(ctx.message.author.id);
      if (!u.liked.length) return ctx.say('No liked songs yet.');
      await addTracks(ctx, withRequester(ctx, u.liked), 'queue', 'your liked songs');
    }
  }
];
