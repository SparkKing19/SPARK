const E = require('../emojis');
const db = require('../db');
const config = require('../config');
const FILTERS = require('../music/filters');
const { languages } = require('../lang');
const { embed } = require('../util');

const C = 'Settings';
const admin = { category: C, admin: true };
const usage = (ctx, cmd, args) => ctx.say(`${E('error')} Usage: \`${ctx.prefix}${cmd} ${args}\``);
const onoff = (v) => (v ? 'on' : 'off');

const toggle = (name, key, label, extra = {}) => ({
  ...admin, name, description: `Toggle ${label}`, ...extra,
  async run(ctx) {
    ctx.g[key] = !ctx.g[key];
    db.save();
    ctx.say(`${E('success')} ${label}: **${onoff(ctx.g[key])}**`);
  }
});

// #channel setter used by musicchannel / requestchannel
const channelSetter = (name, key, label) => ({
  ...admin, name, usage: '[#channel | reset]', description: `Set the ${label}`,
  async run(ctx) {
    if (ctx.args[0]?.toLowerCase() === 'reset') {
      ctx.g[key] = null; db.save();
      return ctx.say(`${E('success')} ${label} cleared.`);
    }
    const ch = ctx.message.mentions.channels.first() || ctx.message.channel;
    ctx.g[key] = ch.id; db.save();
    ctx.say(`${E('success')} ${label}: ${ch}`);
  }
});

module.exports = [
  {
    ...admin, name: 'setprefix', usage: '<new prefix | reset>', description: 'Change the server prefix',
    async run(ctx) {
      const p = ctx.args[0];
      if (!p) return usage(ctx, 'setprefix', '<new prefix | reset>');
      if (p.toLowerCase() === 'reset') ctx.g.prefix = null;
      else if (p.length > 5) return ctx.say(`${E('error')} Prefix can be at most 5 characters.`);
      else ctx.g.prefix = p;
      db.save();
      ctx.say(`${E('success')} Prefix is now \`${ctx.g.prefix || config.prefix}\``);
    }
  },
  toggle('247', 'twentyFourSeven', '24/7 mode (stay in voice)'),
  {
    name: 'join', aliases: ['summon', 'connect'], category: C, description: 'Join your voice channel', voice: true, create: true,
    async run(ctx) { ctx.say(`${E('success')} Joined <#${ctx.gp.voiceChannelId}>.`); }
  },
  {
    name: 'leave', aliases: ['disconnect', 'dc'], category: C, description: 'Leave the voice channel', voice: true, player: true, dj: true,
    async run(ctx) { ctx.gp.destroy(); ctx.say(`${E('success')} Disconnected.`); }
  },
  {
    ...admin, name: 'djrole', usage: '[@role | reset]', description: 'Set the DJ role',
    async run(ctx) {
      if (ctx.args[0]?.toLowerCase() === 'reset') { ctx.g.djRole = null; db.save(); return ctx.say(`${E('success')} DJ role cleared — everyone can use DJ commands.`); }
      const role = ctx.message.mentions.roles.first();
      if (!role) return ctx.say(ctx.g.djRole ? `DJ role: <@&${ctx.g.djRole}>` : `No DJ role set. Use \`${ctx.prefix}djrole @role\`.`);
      ctx.g.djRole = role.id; db.save();
      ctx.say(`${E('success')} DJ role: ${role}`);
    }
  },
  {
    ...admin, name: 'volumelimit', aliases: ['vlimit'], usage: '<10-200>', description: 'Maximum volume',
    async run(ctx) {
      const n = parseInt(ctx.args[0], 10);
      if (!(n >= 10 && n <= 200)) return usage(ctx, 'volumelimit', '<10-200>');
      ctx.g.volumeLimit = n; db.save();
      ctx.say(`${E('success')} Volume limit: **${n}%**`);
    }
  },
  {
    ...admin, name: 'ignorechannel', aliases: ['ignore'], usage: '[#channel]', description: 'Ignore / unignore commands in a channel',
    async run(ctx) {
      const ch = ctx.message.mentions.channels.first() || ctx.message.channel;
      const i = ctx.g.ignored.indexOf(ch.id);
      if (i >= 0) ctx.g.ignored.splice(i, 1); else ctx.g.ignored.push(ch.id);
      db.save();
      ctx.say(`${E('success')} ${ch}: **${i >= 0 ? 'no longer ignored' : 'ignored'}**`);
    }
  },
  {
    ...admin, name: 'reset', description: 'Reset all server settings',
    async run(ctx) { db.resetGuild(ctx.message.guild.id); ctx.say(`${E('success')} Server settings reset to default.`); }
  },
  channelSetter('musicchannel', 'musicChannel', 'music command channel'),
  channelSetter('requestchannel', 'requestChannel', 'song request channel (messages there are played)'),
  toggle('announce', 'announce', 'now-playing announcements'),
  toggle('autoleave', 'autoLeave', 'auto leave when idle / empty'),
  {
    name: 'vcmute', aliases: ['mute'], category: C, description: 'Mute / unmute the music (keeps playing)', voice: true, player: true, dj: true,
    async run(ctx) {
      const m = await ctx.gp.toggleMute();
      ctx.say(`${E('volume')} Music **${m ? 'muted' : 'unmuted'}**.`);
    }
  },
  {
    ...admin, name: 'defaultvolume', usage: '<1-limit>', description: 'Volume used when I join',
    async run(ctx) {
      const n = parseInt(ctx.args[0], 10);
      if (!(n >= 1 && n <= ctx.g.volumeLimit)) return usage(ctx, 'defaultvolume', `<1-${ctx.g.volumeLimit}>`);
      ctx.g.defaultVolume = n; db.save();
      ctx.say(`${E('success')} Default volume: **${n}%**`);
    }
  },
  {
    ...admin, name: 'defaultfilter', usage: '<filter | off>', description: 'Filter applied when I join',
    async run(ctx) {
      const f = ctx.args[0]?.toLowerCase();
      if (f === 'off') ctx.g.defaultFilter = null;
      else if (FILTERS[f]) ctx.g.defaultFilter = f;
      else return ctx.say(`${E('error')} Choose one of: ${Object.keys(FILTERS).map((n) => `\`${n}\``).join(' ')} or \`off\``);
      db.save();
      ctx.say(`${E('success')} Default filter: **${ctx.g.defaultFilter || 'none'}**`);
    }
  },
  {
    name: 'settings', aliases: ['config'], category: C, description: 'Show server settings',
    async run(ctx) {
      const g = ctx.g;
      const ch = (id) => (id ? `<#${id}>` : 'none');
      ctx.send({
        embeds: [embed('', `${E('filter')} Settings`).addFields(
          { name: 'Prefix', value: `\`${g.prefix || config.prefix}\``, inline: true },
          { name: 'DJ role', value: g.djRole ? `<@&${g.djRole}>` : 'none', inline: true },
          { name: 'Language', value: g.language, inline: true },
          { name: 'Volume', value: `default ${g.defaultVolume}% / limit ${g.volumeLimit}%`, inline: true },
          { name: 'Default filter', value: g.defaultFilter || 'none', inline: true },
          { name: '24/7', value: onoff(g.twentyFourSeven), inline: true },
          { name: 'Auto leave', value: onoff(g.autoLeave), inline: true },
          { name: 'Announce', value: onoff(g.announce), inline: true },
          { name: 'Max queue', value: `${g.maxQueue}`, inline: true },
          { name: 'Max duration', value: g.maxDuration ? `${g.maxDuration} min` : 'unlimited', inline: true },
          { name: 'Music channel', value: ch(g.musicChannel), inline: true },
          { name: 'Request channel', value: ch(g.requestChannel), inline: true },
          { name: 'Ignored channels', value: g.ignored.map((i) => `<#${i}>`).join(' ') || 'none' },
          { name: 'Allowed genres (keywords)', value: g.allowedGenres.join(', ') || 'any' }
        )]
      });
    }
  },
  {
    ...admin, name: 'allowedgenres', aliases: ['genres'], usage: '<keywords... | clear>', description: 'Only allow tracks whose title/artist has these keywords',
    async run(ctx) {
      if (!ctx.args.length) return usage(ctx, 'allowedgenres', '<keywords... | clear>');
      if (ctx.args[0].toLowerCase() === 'clear') ctx.g.allowedGenres = [];
      else ctx.g.allowedGenres = ctx.args.join(' ').split(/[,\s]+/).map((s) => s.toLowerCase()).filter(Boolean).slice(0, 20);
      db.save();
      ctx.say(`${E('success')} Allowed keywords: **${ctx.g.allowedGenres.join(', ') || 'any'}**`);
    }
  },
  {
    ...admin, name: 'maxqueue', usage: '<10-1000>', description: 'Maximum queue size',
    async run(ctx) {
      const n = parseInt(ctx.args[0], 10);
      if (!(n >= 10 && n <= 1000)) return usage(ctx, 'maxqueue', '<10-1000>');
      ctx.g.maxQueue = n; db.save();
      ctx.say(`${E('success')} Max queue: **${n}**`);
    }
  },
  {
    ...admin, name: 'maxduration', usage: '<minutes | 0>', description: 'Maximum track length (0 = unlimited)',
    async run(ctx) {
      const n = parseInt(ctx.args[0], 10);
      if (!(n >= 0 && n <= 600)) return usage(ctx, 'maxduration', '<minutes | 0>');
      ctx.g.maxDuration = n; db.save();
      ctx.say(`${E('success')} Max duration: **${n ? n + ' min' : 'unlimited'}**`);
    }
  },
  {
    ...admin, name: 'language', aliases: ['lang'], usage: `<${languages.join(' | ')}>`, description: 'Bot language (en / hi)',
    async run(ctx) {
      const l = ctx.args[0]?.toLowerCase();
      if (!languages.includes(l)) return usage(ctx, 'language', `<${languages.join(' | ')}>`);
      ctx.g.language = l; db.save();
      ctx.say(`${E('success')} Language: **${l}**`);
    }
  }
];
