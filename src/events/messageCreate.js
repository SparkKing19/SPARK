const config = require('../config');
const db = require('../db');
const E = require('../emojis');
const store = require('../music/store');
const { embed } = require('../util');
const { t } = require('../lang');
const { ensurePlayer } = require('../music/manager');

module.exports = async (client, message) => {
  if (message.author.bot || !message.guild || !message.member) return;

  const g = db.guild(message.guild.id);
  const prefix = g.prefix || config.prefix;
  const isAdmin = message.member.permissions.has('ManageGuild') || config.owners.includes(message.author.id);
  let content = message.content;

  // Song request channel: plain messages are treated as `play <text>`
  if (g.requestChannel === message.channel.id && content.trim() && !content.startsWith(prefix)) {
    content = `${prefix}play ${content}`;
  }
  if (new RegExp(`^<@!?${client.user.id}>$`).test(content.trim())) {
    return message.channel.send({ embeds: [embed(`My prefix here is \`${prefix}\` — try \`${prefix}help\``)] }).catch(() => {});
  }
  if (!content.startsWith(prefix)) return;

  const args = content.slice(prefix.length).trim().split(/\s+/);
  const name = (args.shift() || '').toLowerCase();
  const cmd = client.commands.get(name);
  if (!cmd) return;

  const send = (opts) => message.channel.send(opts);
  const say = (text, title) => send({ embeds: [embed(text, title)] }).catch(() => {});
  const lang = g.language;
  const ctx = { client, message, args, g, prefix, isAdmin, send, say, cmd, gp: store.get(message.guild.id) };

  if (g.ignored.includes(message.channel.id) && !isAdmin) return;
  if (g.musicChannel && message.channel.id !== g.musicChannel && !isAdmin) {
    return say(`${E('error')} Please use music commands in <#${g.musicChannel}>.`);
  }
  if (cmd.admin && !isAdmin) return say(`${E('error')} You need the **Manage Server** permission.`);
  if (cmd.dj && g.djRole && !isAdmin && !message.member.roles.cache.has(g.djRole)) {
    return say(`${E('error')} You need the <@&${g.djRole}> role to use this command.`);
  }
  if (cmd.voice) {
    const vc = message.member.voice.channel;
    if (!vc) return say(`${E('error')} ${t(lang, 'joinVc')}`);
    if (ctx.gp && ctx.gp.voiceChannelId !== vc.id) return say(`${E('error')} ${t(lang, 'sameVc')}`);
  }
  if (cmd.player && !ctx.gp) return say(`${E('error')} ${t(lang, 'nothing')}`);
  if (cmd.track && !ctx.gp?.current) return say(`${E('error')} ${t(lang, 'nothing')}`);
  if (cmd.create && !ctx.gp) {
    ctx.gp = await ensurePlayer(ctx);
    if (!ctx.gp) return;
  }

  try {
    await cmd.run(ctx);
  } catch (err) {
    console.error(`[command:${cmd.name}]`, err);
    say(`${E('error')} Something went wrong: \`${err.message}\``);
  }
};
