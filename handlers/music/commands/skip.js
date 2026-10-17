'use strict';
module.exports = {
  name: 'skip',
  aliases: ['s', 'next'],
  async execute(message, args, client, music) {
    const q = music.get(message.guild.id);
    if (!q?.player || !q.current) return message.reply('Nothing is playing.');
    music.ensureSameVoice(message, q);
    await q.player.stopTrack();
    return message.reply('Skipped the current track.');
  }
};
