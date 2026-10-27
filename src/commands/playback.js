const E = require('../emojis');
const { parseTime, fmt, fmtTrack, link } = require('../util');
const { resolve, addTracks, playQuery } = require('../music/manager');

const C = 'Playback';
const usage = (ctx, cmd, args) => ctx.say(`${E('error')} Usage: \`${ctx.prefix}${cmd} ${args}\``);

module.exports = [
  {
    name: 'play', aliases: ['p'], category: C, usage: '<song name | url>', description: 'Play a song or playlist',
    voice: true, create: true,
    async run(ctx) {
      const q = ctx.args.join(' ');
      if (!q) {
        if (ctx.gp.paused) { await ctx.gp.setPaused(false); return ctx.say(`${E('play')} Resumed.`); }
        return usage(ctx, 'play', '<song name | url>');
      }
      await playQuery(ctx, q, 'queue');
    }
  },
  {
    name: 'playnow', aliases: ['pn'], category: C, usage: '<song name | url>', description: 'Play a song immediately',
    voice: true, create: true, dj: true,
    async run(ctx) {
      const q = ctx.args.join(' ');
      if (!q) return usage(ctx, 'playnow', '<song name | url>');
      await playQuery(ctx, q, 'now');
    }
  },
  {
    name: 'playnext', aliases: ['pnext'], category: C, usage: '<song name | url>', description: 'Add a song to the front of the queue',
    voice: true, create: true,
    async run(ctx) {
      const q = ctx.args.join(' ');
      if (!q) return usage(ctx, 'playnext', '<song name | url>');
      await playQuery(ctx, q, 'next');
    }
  },
  {
    name: 'search', aliases: ['find'], category: C, usage: '<query>', description: 'Search and pick a result',
    voice: true, create: true,
    async run(ctx) {
      const q = ctx.args.join(' ');
      if (!q) return usage(ctx, 'search', '<query>');
      const r = await resolve(ctx.client, q, ctx.message.author.id);
      if (r.type === 'error') return ctx.say(`${E('error')} ${r.message}`);
      const list = r.tracks.slice(0, 5);
      if (!list.length) return ctx.say(`${E('error')} No results.`);
      await ctx.say(
        list.map((t, i) => `**${i + 1}.** ${link(t)} \`${fmtTrack(t)}\``).join('\n') + '\n\nReply with a number (1-5) or `cancel`.',
        `${E('search')} Results`
      );
      const col = await ctx.message.channel.awaitMessages({
        filter: (m) => m.author.id === ctx.message.author.id, max: 1, time: 30000
      });
      const m = col.first();
      if (!m) return ctx.say(`${E('clock')} Search timed out.`);
      const n = parseInt(m.content, 10);
      if (!n || n < 1 || n > list.length) return ctx.say('Cancelled.');
      await addTracks(ctx, [list[n - 1]], 'queue');
    }
  },
  {
    name: 'pause', category: C, description: 'Pause the music', voice: true, player: true, track: true,
    async run(ctx) {
      if (ctx.gp.paused) return ctx.say('Already paused.');
      await ctx.gp.setPaused(true);
      ctx.say(`${E('pause')} Paused.`);
    }
  },
  {
    name: 'resume', aliases: ['unpause'], category: C, description: 'Resume the music', voice: true, player: true, track: true,
    async run(ctx) {
      if (!ctx.gp.paused) return ctx.say('Not paused.');
      await ctx.gp.setPaused(false);
      ctx.say(`${E('play')} Resumed.`);
    }
  },
  {
    name: 'stop', category: C, description: 'Stop and clear the queue', voice: true, player: true, dj: true,
    async run(ctx) {
      await ctx.gp.stop();
      ctx.say(`${E('stop')} Stopped and cleared the queue.`);
    }
  },
  {
    name: 'skip', aliases: ['s', 'next'], category: C, description: 'Skip the current track', voice: true, player: true, track: true, dj: true,
    async run(ctx) {
      const t = ctx.gp.current;
      await ctx.gp.skip();
      ctx.say(`${E('skip')} Skipped **${t.title}**`);
    }
  },
  {
    name: 'previous', aliases: ['prev', 'back'], category: C, description: 'Play the previous track', voice: true, player: true, dj: true,
    async run(ctx) {
      const gp = ctx.gp;
      const prev = gp.history.shift();
      if (!prev) return ctx.say(`${E('error')} No previous track.`);
      if (gp.current) gp.queue.unshift(gp.current);
      await gp.start(prev, false);
      ctx.say(`${E('previous')} Playing previous: ${link(prev)}`);
    }
  },
  {
    name: 'seek', category: C, usage: '<1:30 | 90 | 1m30s>', description: 'Seek to a position', voice: true, player: true, track: true,
    async run(ctx) {
      const cur = ctx.gp.current;
      if (cur.isStream) return ctx.say(`${E('error')} Can't seek in a live stream.`);
      const ms = parseTime(ctx.args[0]);
      if (ms === null) return usage(ctx, 'seek', '<1:30 | 90 | 1m30s>');
      if (ms >= cur.length) return ctx.say(`${E('error')} Track is only ${fmt(cur.length)} long.`);
      await ctx.gp.player.seekTo(ms);
      ctx.say(`${E('clock')} Seeked to **${fmt(ms)}**`);
    }
  },
  {
    name: 'forward', aliases: ['ff', 'fwd'], category: C, usage: '[seconds=10]', description: 'Fast-forward', voice: true, player: true, track: true,
    async run(ctx) {
      const cur = ctx.gp.current;
      if (cur.isStream) return ctx.say(`${E('error')} Can't seek in a live stream.`);
      const sec = Math.max(1, parseInt(ctx.args[0], 10) || 10);
      const to = Math.min(ctx.gp.position + sec * 1000, cur.length - 1000);
      await ctx.gp.player.seekTo(Math.max(0, to));
      ctx.say(`${E('skip')} Forwarded to **${fmt(to)}**`);
    }
  },
  {
    name: 'rewind', aliases: ['rw'], category: C, usage: '[seconds=10]', description: 'Rewind', voice: true, player: true, track: true,
    async run(ctx) {
      if (ctx.gp.current.isStream) return ctx.say(`${E('error')} Can't seek in a live stream.`);
      const sec = Math.max(1, parseInt(ctx.args[0], 10) || 10);
      const to = Math.max(0, ctx.gp.position - sec * 1000);
      await ctx.gp.player.seekTo(to);
      ctx.say(`${E('previous')} Rewound to **${fmt(to)}**`);
    }
  },
  {
    name: 'replay', aliases: ['restart'], category: C, description: 'Restart the current track', voice: true, player: true, track: true,
    async run(ctx) {
      await ctx.gp.player.seekTo(0);
      ctx.say(`${E('loop')} Replaying **${ctx.gp.current.title}**`);
    }
  },
  {
    name: 'forceskip', aliases: ['fskip'], category: C, description: 'Skip without voting (Manage Server)', voice: true, player: true, track: true, admin: true,
    async run(ctx) {
      await ctx.gp.skip();
      ctx.say(`${E('skip')} Force skipped.`);
    }
  },
  {
    name: 'voteskip', aliases: ['vs'], category: C, description: 'Vote to skip the current track', voice: true, player: true, track: true,
    async run(ctx) {
      const gp = ctx.gp;
      const vc = ctx.message.guild.channels.cache.get(gp.voiceChannelId);
      const listeners = vc.members.filter((m) => !m.user.bot).size;
      const need = Math.ceil(listeners / 2);
      if (gp.votes.has(ctx.message.author.id)) return ctx.say('You already voted.');
      gp.votes.add(ctx.message.author.id);
      if (gp.votes.size >= need) {
        await gp.skip();
        return ctx.say(`${E('skip')} Vote passed (${gp.votes.size}/${need}). Skipped.`);
      }
      ctx.say(`${E('skip')} Vote added: **${gp.votes.size}/${need}**`);
    }
  }
];
