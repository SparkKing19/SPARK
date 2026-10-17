'use strict';
module.exports = {
  name: 'shuffle',
  async execute(message, args, client, music) {
    const q = music.get(message.guild.id);
    if (!q?.tracks.length) return message.reply('There are no queued tracks to shuffle.');
    music.ensureSameVoice(message, q);
    for (let i = q.tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [q.tracks[i], q.tracks[j]] = [q.tracks[j], q.tracks[i]];
    }
    return message.reply(`Shuffled **${q.tracks.length}** queued tracks.`);
  }
};
