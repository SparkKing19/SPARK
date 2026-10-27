const E = require('../emojis');
const db = require('../db');
const config = require('../config');
const { embed, fmtTrack, link } = require('../util');
const { resolve } = require('../music/manager');

const C = 'Info';
const ORDER = ['Playback', 'Queue', 'Filters', 'Playlists', 'Info', 'Settings'];
const dur = (s) => {
  s = Math.floor(s);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return `${d ? d + 'd ' : ''}${h}h ${m}m ${s % 60}s`;
};

module.exports = [
  {
    name: 'lyrics', aliases: ['ly'], category: C, usage: '[artist - title]', description: 'Get lyrics (current song by default)',
    async run(ctx) {
      let artist, title;
      const q = ctx.args.join(' ');
      if (q.includes('-')) [artist, title] = q.split('-').map((s) => s.trim());
      else if (!q && ctx.gp?.current) ({ author: artist, title } = ctx.gp.current);
      else return ctx.say(`${E('error')} Usage: \`${ctx.prefix}lyrics [artist - title]\``);
      artist = artist.replace(/ - Topic|VEVO/gi, '').trim();
      title = title.replace(/\(.*?\)|\[.*?\]|official.*|lyrics?|video|audio|\bhd\b|\b4k\b/gi, '').replace(/\s+/g, ' ').trim();
      try {
        const res = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`, { signal: AbortSignal.timeout(10000) });
        const json = await res.json();
        if (!json.lyrics) throw new Error('none');
        const text = json.lyrics.trim();
        ctx.send({ embeds: [embed(text.slice(0, 4000) + (text.length > 4000 ? '\n…' : ''), `${E('music')} ${artist} - ${title}`)] });
      } catch {
        ctx.say(`${E('error')} Lyrics not found for **${artist} - ${title}**. Try \`${ctx.prefix}lyrics artist - title\`.`);
      }
    }
  },
  {
    name: 'ping', category: C, description: 'Bot latency',
    async run(ctx) {
      const t = Date.now();
      const m = await ctx.send({ embeds: [embed('Pinging…')] });
      m.edit({ embeds: [embed(`🏓 API **${Date.now() - t}ms** • WebSocket **${Math.round(ctx.client.ws.ping)}ms**`)] });
    }
  },
  {
    name: 'stats', category: C, description: 'Bot statistics',
    async run(ctx) {
      const c = ctx.client;
      const node = c.shoukaku.getIdealNode();
      const store = require('../music/store');
      ctx.send({
        embeds: [embed('', `${E('music')} ${config.name} stats`).addFields(
          { name: 'Servers', value: `${c.guilds.cache.size}`, inline: true },
          { name: 'Users', value: `${c.guilds.cache.reduce((a, g) => a + g.memberCount, 0)}`, inline: true },
          { name: 'Active players', value: `${store.size}`, inline: true },
          { name: 'Memory', value: `${(process.memoryUsage().rss / 1048576).toFixed(0)} MB`, inline: true },
          { name: 'Uptime', value: dur(process.uptime()), inline: true },
          { name: 'Lavalink', value: node ? `${node.stats?.playingPlayers ?? 0} playing` : 'offline', inline: true }
        )]
      });
    }
  },
  {
    name: 'help', aliases: ['h', 'commands'], category: C, usage: '[command]', description: 'Show all commands',
    async run(ctx) {
      const list = ctx.client.commandList;
      const name = ctx.args[0]?.toLowerCase();
      if (name) {
        const c = ctx.client.commands.get(name);
        if (!c) return ctx.say(`${E('error')} Unknown command.`);
        return ctx.say(
          `**${ctx.prefix}${c.name}** ${c.usage || ''}\n${c.description || ''}` +
          (c.aliases?.length ? `\nAliases: ${c.aliases.map((a) => `\`${a}\``).join(', ')}` : '') +
          (c.dj ? '\n*Needs DJ role (if set)*' : '') + (c.admin ? '\n*Needs Manage Server*' : ''),
          `${E('music')} ${c.category}`
        );
      }
      const e = embed(`Prefix: \`${ctx.prefix}\` • \`${ctx.prefix}help <command>\` for details`, `${E('music')} ${config.name} — ${list.length} commands`);
      for (const cat of ORDER) {
        const cmds = list.filter((c) => c.category === cat);
        if (cmds.length) e.addFields({ name: `${cat} (${cmds.length})`, value: cmds.map((c) => `\`${c.name}\``).join(' ') });
      }
      ctx.send({ embeds: [e] });
    }
  },
  {
    name: 'invite', category: C, description: 'Invite the bot',
    async run(ctx) {
      ctx.say(`[Click here to invite me](https://discord.com/oauth2/authorize?client_id=${ctx.client.user.id}&permissions=3492864&scope=bot)`, `${E('music')} Invite`);
    }
  },
  {
    name: 'support', category: C, description: 'Support server link',
    async run(ctx) { ctx.say(config.supportUrl ? `[Join the support server](${config.supportUrl})` : 'No support server configured (set SUPPORT_URL in .env).'); }
  },
  {
    name: 'uptime', category: C, description: 'How long the bot has been online',
    async run(ctx) { ctx.say(`${E('clock')} Online for **${dur(process.uptime())}**`); }
  },
  {
    name: 'about', category: C, description: 'About this bot',
    async run(ctx) {
      ctx.say(`**${config.name}** is a music-only bot with ${ctx.client.commandList.length} commands.\nPowered by discord.js, Shoukaku and Lavalink.\nUse \`${ctx.prefix}help\` to see everything.`, `${E('music')} About`);
    }
  },
  {
    name: 'trackinfo', aliases: ['ti', 'songinfo'], category: C, usage: '[queue position]', description: 'Details about a track', player: true,
    async run(ctx) {
      const gp = ctx.gp;
      const n = parseInt(ctx.args[0], 10);
      const t = n >= 1 ? gp.queue[n - 1] : gp.current;
      if (!t) return ctx.say(`${E('error')} No such track.`);
      const e = embed(`${link(t)}\nby **${t.author}**`, `${E('music')} Track info`).addFields(
        { name: 'Duration', value: fmtTrack(t), inline: true },
        { name: 'Requested by', value: t.requester ? `<@${t.requester}>` : 'Autoplay', inline: true },
        { name: 'Source ID', value: `\`${t.identifier}\``, inline: true }
      );
      if (t.artwork) e.setThumbnail(t.artwork);
      ctx.send({ embeds: [e] });
    }
  },
  {
    name: 'artistinfo', aliases: ['artist'], category: C, usage: '<artist>', description: 'Top search results for an artist',
    async run(ctx) {
      const q = ctx.args.join(' ');
      if (!q) return ctx.say(`${E('error')} Usage: \`${ctx.prefix}artistinfo <artist>\``);
      const r = await resolve(ctx.client, q, ctx.message.author.id);
      if (r.type === 'error') return ctx.say(`${E('error')} ${r.message}`);
      if (!r.tracks.length) return ctx.say(`${E('error')} Nothing found.`);
      const authors = [...new Set(r.tracks.map((t) => t.author))].slice(0, 3).join(', ');
      ctx.say(`**Channels / artists:** ${authors}\n\n` + r.tracks.slice(0, 5).map((t, i) => `**${i + 1}.** ${link(t)} \`${fmtTrack(t)}\``).join('\n'), `${E('search')} ${q}`);
    }
  },
  {
    name: 'topsongs', aliases: ['top'], category: C, description: 'Most played songs in this server',
    async run(ctx) {
      const top = Object.values(db.plays(ctx.message.guild.id).top).sort((a, b) => b.count - a.count).slice(0, 10);
      if (!top.length) return ctx.say('Nothing played yet.');
      ctx.say(top.map((t, i) => `**${i + 1}.** ${link(t)} — ${t.count} plays`).join('\n'), `${E('music')} Top songs`);
    }
  },
  {
    name: 'recent', category: C, description: 'Recently played in this server',
    async run(ctx) {
      const rec = db.plays(ctx.message.guild.id).recent.slice(0, 10);
      if (!rec.length) return ctx.say('Nothing played yet.');
      ctx.say(rec.map((t, i) => `**${i + 1}.** ${link(t)} — <t:${Math.floor(t.at / 1000)}:R>`).join('\n'), `${E('clock')} Recently played`);
    }
  }
];
