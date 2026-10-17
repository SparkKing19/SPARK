'use strict';
module.exports = {
  name: 'clear',
  aliases: ['queueclear'],
  async execute(message, args, client, music) {
    const q = music.get(message.guild.id);
    if (!q) return message.reply('There is no active music session.');
    music.ensureSameVoice(message, q);
    const count = q.tracks.length;
    q.tracks = [];
    return message.reply(`Cleared **${count}** queued tracks.`);
  }
};
