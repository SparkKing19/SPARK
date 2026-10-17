'use strict';
module.exports = {
  name: 'queue',
  aliases: ['q'],
  async execute(message, args, client, music) {
    const q = music.get(message.guild.id);
    if (!q?.current && !q?.tracks.length) return message.reply('The queue is empty.');
    const page = Math.max(1, Number.parseInt(args[0], 10) || 1);
    const pageSize = 10;
    const start = (page - 1) * pageSize;
    const upcoming = q.tracks.slice(start, start + pageSize);
    const rows = [];
    if (q.current) rows.push(`**Now:** ${q.current.title}`);
    if (upcoming.length) rows.push(...upcoming.map((t, i) => `**${start + i + 1}.** ${t.title} — ${t.requesterTag}`));
    const pages = Math.max(1, Math.ceil(q.tracks.length / pageSize));
    rows.push(`\nPage ${Math.min(page, pages)}/${pages} • ${q.tracks.length} queued • Loop: ${q.loop}`);
    return message.reply(rows.join('\n').slice(0, 1900));
  }
};
