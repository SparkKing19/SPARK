const E = require('../emojis');
const FILTERS = require('../music/filters');

const C = 'Filters';
const base = { category: C, voice: true, player: true, dj: true };
const aliases = { bassboost: ['bb', 'bass'], nightcore: ['nc'], vaporwave: ['vw'], karaoke: ['kk'] };

// One toggle command per preset
const presets = Object.keys(FILTERS).map((name) => ({
  ...base,
  name,
  aliases: aliases[name] || [],
  description: `Toggle the ${name} filter`,
  async run(ctx) {
    if (ctx.gp.filterName === name) {
      await ctx.gp.applyFilter(null);
      return ctx.say(`${E('filter')} **${name}** disabled.`);
    }
    await ctx.gp.applyFilter(name);
    ctx.say(`${E('filter')} **${name}** enabled.`);
  }
}));

const usage = (ctx, cmd, args) => ctx.say(`${E('error')} Usage: \`${ctx.prefix}${cmd} ${args}\``);

module.exports = [
  ...presets,
  {
    ...base, name: 'volume', aliases: ['vol', 'v'], usage: '[0-limit]', description: 'Show or set the volume',
    async run(ctx) {
      if (!ctx.args[0]) return ctx.say(`${E('volume')} Volume: **${ctx.gp.volume}%** (limit ${ctx.g.volumeLimit}%)`);
      const v = parseInt(ctx.args[0], 10);
      if (Number.isNaN(v) || v < 0) return usage(ctx, 'volume', `[0-${ctx.g.volumeLimit}]`);
      const vol = Math.min(v, ctx.g.volumeLimit);
      await ctx.gp.setVolume(vol);
      ctx.say(`${E('volume')} Volume set to **${vol}%**${v > vol ? ' (server limit)' : ''}`);
    }
  },
  {
    ...base, name: 'speed', usage: '<0.5-3>', description: 'Change playback speed',
    async run(ctx) {
      const v = parseFloat(ctx.args[0]);
      if (!(v >= 0.5 && v <= 3)) return usage(ctx, 'speed', '<0.5-3>');
      await ctx.gp.player.setFilters({ timescale: { speed: v, pitch: 1, rate: 1 } });
      ctx.gp.filterName = `speed ${v}x`;
      ctx.say(`${E('filter')} Speed: **${v}x**`);
    }
  },
  {
    ...base, name: 'pitch', usage: '<0.5-2>', description: 'Change pitch',
    async run(ctx) {
      const v = parseFloat(ctx.args[0]);
      if (!(v >= 0.5 && v <= 2)) return usage(ctx, 'pitch', '<0.5-2>');
      await ctx.gp.player.setFilters({ timescale: { speed: 1, pitch: v, rate: 1 } });
      ctx.gp.filterName = `pitch ${v}x`;
      ctx.say(`${E('filter')} Pitch: **${v}x**`);
    }
  },
  {
    ...base, name: 'equalizer', aliases: ['eq'], usage: '<band 0-14> <gain -0.25..1> | reset', description: 'Custom equalizer band',
    async run(ctx) {
      const gp = ctx.gp;
      if (ctx.args[0]?.toLowerCase() === 'reset') { await gp.applyFilter(null); return ctx.say(`${E('filter')} Equalizer reset.`); }
      const band = parseInt(ctx.args[0], 10), gain = parseFloat(ctx.args[1]);
      if (!(band >= 0 && band <= 14) || !(gain >= -0.25 && gain <= 1)) return usage(ctx, 'equalizer', '<band 0-14> <gain -0.25..1> | reset');
      gp.eq[band] = gain;
      await gp.player.setFilters({ equalizer: Object.entries(gp.eq).map(([b, g]) => ({ band: +b, gain: g })) });
      gp.filterName = 'custom equalizer';
      ctx.say(`${E('filter')} Band **${band}** → **${gain}**`);
    }
  },
  {
    ...base, name: 'resetfilters', aliases: ['rf', 'clearfilters'], description: 'Remove all filters',
    async run(ctx) { await ctx.gp.applyFilter(null); ctx.say(`${E('filter')} All filters cleared.`); }
  }
];
