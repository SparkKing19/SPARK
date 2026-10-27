const E = require('../emojis');
const db = require('../db');
const { embed, fmt, fmtTrack, link, paginate, bar, shuffle, slim } = require('../util');
const { addTracks } = require('../music/manager');

const C = 'Queue';
const usage = (ctx, cmd, args) => ctx.say(`${E('error')} Usage: \`${ctx.prefix}${cmd} ${args}\``);
const idx = (ctx, v) => { const n = parseInt(v, 10); return n >= 1 && n <= ctx.gp.queue.length ? n : null; };

module.exports = [
  {
    name: 'queue', aliases: ['q'], category: C, usage: '[page]', description: 'Show the queue', player: true,
    async run(ctx) {
      const gp = ctx.gp;
      const { items, page, pages, offset } = paginate(gp.queue, parseInt(ctx.args[0], 10) || 1);
      const cur = gp.current ? `**Now:** ${link(gp.current)} \`${fmtTrack(gp.current)}\`\n\n` : '';
      const lines = items.map((t, i) => `**${offset + i + 1}.** ${link(t)} \`${fmtTrack(t)}\``);
      const total = gp.queue.reduce((a, t) => a + (t.isStream ? 0 : t.length), 0);
      ctx.send({
        embeds: [embed(cur + (lines.join('\n') || '_Queue is empty_'), `${E('queue')} Queue`)
          .setFooter({ text: `Page ${page}/${pages} • ${gp.queue.length} tracks • ${fmt(total)}` })]
      });
    }
  },
  {
    name: 'nowplaying', aliases: ['np', 'current'], category: C, description: 'Show the current track', player: true, track: true,
    async run(ctx) {
      const gp = ctx.gp, cur = gp.current;
      const e = gp.npEmbed().addFields({
        name: 'Progress',
        value: `${bar(gp.position, cur.isStream ? 0 : cur.length)}\n${fmt(gp.position)} / ${fmtTrack(cur)}`
      });
      ctx.send({ embeds: [e] });
    }
  },
  {
    name: 'remove', aliases: ['rm'], category: C, usage: '<n | n-m>', description: 'Remove track(s) from the queue', voice: true, player: true, dj: true,
    async run(ctx) {
      const m = ctx.args[0]?.match(/^(\d+)(?:-(\d+))?$/);
      if (!m) return usage(ctx, 'remove', '<n | n-m>');
      const a = +m[1], b = +(m[2] || m[1]);
      if (a < 1 || b < a || b > ctx.gp.queue.length) return ctx.say(`${E('error')} Invalid position.`);
      const removed = ctx.gp.queue.splice(a - 1, b - a + 1);
      ctx.say(`${E('success')} Removed **${removed.length}** track(s).`);
    }
  },
  {
    name: 'removedupes', aliases: ['dedupe'], category: C, description: 'Remove duplicate tracks', voice: true, player: true, dj: true,
    async run(ctx) {
      const gp = ctx.gp;
      const seen = new Set(gp.current ? [gp.current.uri] : []);
      const before = gp.queue.length;
      gp.queue = gp.queue.filter((t) => (seen.has(t.uri) ? false : (seen.add(t.uri), true)));
      ctx.say(`${E('success')} Removed **${before - gp.queue.length}** duplicate(s).`);
    }
  },
  {
    name: 'clear', aliases: ['cq'], category: C, description: 'Clear the queue', voice: true, player: true, dj: true,
    async run(ctx) { ctx.gp.queue = []; ctx.say(`${E('success')} Queue cleared.`); }
  },
  {
    name: 'shuffle', aliases: ['mix'], category: C, description: 'Shuffle the queue', voice: true, player: true, dj: true,
    async run(ctx) {
      if (ctx.gp.queue.length < 2) return ctx.say(`${E('error')} Need at least 2 tracks in the queue.`);
      shuffle(ctx.gp.queue);
      ctx.say(`${E('shuffle')} Queue shuffled.`);
    }
  },
  {
    name: 'move', category: C, usage: '<from> <to>', description: 'Move a track in the queue', voice: true, player: true, dj: true,
    async run(ctx) {
      const a = idx(ctx, ctx.args[0]), b = idx(ctx, ctx.args[1]);
      if (!a || !b) return usage(ctx, 'move', '<from> <to>');
      const [t] = ctx.gp.queue.splice(a - 1, 1);
      ctx.gp.queue.splice(b - 1, 0, t);
      ctx.say(`${E('success')} Moved ${link(t)} to position **${b}**.`);
    }
  },
  {
    name: 'skipto', category: C, usage: '<position>', description: 'Skip to a queue position', voice: true, player: true, dj: true,
    async run(ctx) {
      const n = idx(ctx, ctx.args[0]);
      if (!n) return usage(ctx, 'skipto', '<position>');
      ctx.gp.queue.splice(0, n - 1);
      await ctx.gp.skip();
      ctx.say(`${E('skip')} Skipped to position **${n}**.`);
    }
  },
  {
    name: 'jump', category: C, usage: '<position>', description: 'Play a queued track now (keeps the rest)', voice: true, player: true, dj: true,
    async run(ctx) {
      const gp = ctx.gp;
      const n = idx(ctx, ctx.args[0]);
      if (!n) return usage(ctx, 'jump', '<position>');
      const [t] = gp.queue.splice(n - 1, 1);
      if (gp.current) gp.queue.unshift(gp.current);
      await gp.start(t, false);
      ctx.say(`${E('play')} Jumped to ${link(t)}`);
    }
  },
  {
    name: 'loop', aliases: ['repeat'], category: C, usage: '[off|track|queue]', description: 'Set loop mode', voice: true, player: true,
    async run(ctx) {
      const map = { off: 'off', none: 'off', track: 'track', song: 'track', one: 'track', queue: 'queue', all: 'queue' };
      const gp = ctx.gp;
      const arg = ctx.args[0]?.toLowerCase();
      gp.loop = arg ? (map[arg] || gp.loop) : ({ off: 'track', track: 'queue', queue: 'off' })[gp.loop];
      ctx.say(`${E('loop')} Loop: **${gp.loop}**`);
    }
  },
  {
    name: 'loopqueue', aliases: ['lq'], category: C, description: 'Toggle queue loop', voice: true, player: true,
    async run(ctx) {
      ctx.gp.loop = ctx.gp.loop === 'queue' ? 'off' : 'queue';
      ctx.say(`${E('loop')} Queue loop: **${ctx.gp.loop === 'queue' ? 'on' : 'off'}**`);
    }
  },
  {
    name: 'loopsong', aliases: ['ls', 'looptrack'], category: C, description: 'Toggle track loop', voice: true, player: true,
    async run(ctx) {
      ctx.gp.loop = ctx.gp.loop === 'track' ? 'off' : 'track';
      ctx.say(`${E('loop')} Track loop: **${ctx.gp.loop === 'track' ? 'on' : 'off'}**`);
    }
  },
  {
    name: 'autoplay', aliases: ['ap'], category: C, description: 'Toggle autoplay (related songs)', voice: true, player: true,
    async run(ctx) {
      ctx.gp.autoplay = !ctx.gp.autoplay;
      ctx.say(`${E('music')} Autoplay: **${ctx.gp.autoplay ? 'on' : 'off'}**`);
    }
  },
  {
    name: 'savequeue', aliases: ['sq'], category: C, usage: '<name>', description: 'Save the current queue for later', player: true,
    async run(ctx) {
      const name = ctx.args[0]?.toLowerCase();
      if (!name) return usage(ctx, 'savequeue', '<name>');
      const u = db.user(ctx.message.author.id);
      if (!u.saved[name] && Object.keys(u.saved).length >= 10) return ctx.say(`${E('error')} You can keep up to 10 saved queues.`);
      const tracks = [ctx.gp.current, ...ctx.gp.queue].filter(Boolean).map(slim).slice(0, 200);
      if (!tracks.length) return ctx.say(`${E('error')} Nothing to save.`);
      u.saved[name] = tracks;
      db.save();
      ctx.say(`${E('success')} Saved **${tracks.length}** tracks as **${name}**.`);
    }
  },
  {
    name: 'loadqueue', aliases: ['lqueue'], category: C, usage: '[name]', description: 'Load a saved queue', voice: true, create: true,
    async run(ctx) {
      const u = db.user(ctx.message.author.id);
      const name = ctx.args[0]?.toLowerCase();
      if (!name) {
        const names = Object.keys(u.saved);
        return ctx.say(names.length ? `Your saved queues: ${names.map((n) => `\`${n}\``).join(', ')}` : 'You have no saved queues.');
      }
      const saved = u.saved[name];
      if (!saved) return ctx.say(`${E('error')} No saved queue named **${name}**.`);
      await addTracks(ctx, saved.map((t) => ({ ...t, requester: ctx.message.author.id })), 'queue', name);
    }
  },
  {
    name: 'reverse', category: C, description: 'Reverse the queue', voice: true, player: true, dj: true,
    async run(ctx) { ctx.gp.queue.reverse(); ctx.say(`${E('shuffle')} Queue reversed.`); }
  },
  {
    name: 'swap', category: C, usage: '<a> <b>', description: 'Swap two tracks in the queue', voice: true, player: true, dj: true,
    async run(ctx) {
      const a = idx(ctx, ctx.args[0]), b = idx(ctx, ctx.args[1]);
      if (!a || !b) return usage(ctx, 'swap', '<a> <b>');
      const q = ctx.gp.queue;
      [q[a - 1], q[b - 1]] = [q[b - 1], q[a - 1]];
      ctx.say(`${E('success')} Swapped **${a}** and **${b}**.`);
    }
  },
  {
    name: 'queuelength', aliases: ['ql'], category: C, description: 'Queue size and total duration', player: true,
    async run(ctx) {
      const q = ctx.gp.queue;
      const total = q.reduce((a, t) => a + (t.isStream ? 0 : t.length), 0);
      ctx.say(`${E('queue')} **${q.length}** tracks • **${fmt(total)}** total`);
    }
  },
  {
    name: 'history', aliases: ['hist'], category: C, usage: '[page]', description: 'Tracks played in this session', player: true,
    async run(ctx) {
      const { items, page, pages, offset } = paginate(ctx.gp.history, parseInt(ctx.args[0], 10) || 1);
      if (!items.length) return ctx.say('No history yet.');
      ctx.send({
        embeds: [embed(items.map((t, i) => `**${offset + i + 1}.** ${link(t)}`).join('\n'), `${E('clock')} History`)
          .setFooter({ text: `Page ${page}/${pages}` })]
      });
    }
  },
  {
    name: 'undo', category: C, description: 'Remove the last tracks you added', voice: true, player: true, dj: true,
    async run(ctx) {
      const gp = ctx.gp;
      const batch = gp.lastBatch.filter((t) => gp.queue.includes(t));
      if (!batch.length) return ctx.say(`${E('error')} Nothing to undo.`);
      gp.queue = gp.queue.filter((t) => !batch.includes(t));
      gp.lastBatch = [];
      ctx.say(`${E('success')} Removed the last **${batch.length}** added track(s).`);
    }
  }
];
