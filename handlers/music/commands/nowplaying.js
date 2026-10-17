'use strict';
module.exports = {
  name: 'nowplaying',
  aliases: ['np', 'current'],
  async execute(message, args, client, music) {
    const q = music.get(message.guild.id);
    if (!q?.current) return message.reply('Nothing is playing right now.');
    const t = q.current;
    const duration = music.formatTime(t.length);
    return message.reply(`**Now Playing:** [${t.title}](${t.uri || 'https://discord.com'})\n**Artist:** ${t.author}\n**Duration:** ${duration}\n**Requested by:** ${t.requesterTag}\n**Loop:** ${q.loop}`);
  }
};
