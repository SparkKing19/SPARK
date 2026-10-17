'use strict';
module.exports = {
  name: 'resume',
  aliases: ['unpause'],
  async execute(message, args, client, music) {
    const q = music.get(message.guild.id);
    if (!q?.player || !q.current) return message.reply('Nothing is playing.');
    music.ensureSameVoice(message, q);
    await q.player.setPaused(false);
    q.paused = false;
    return message.reply('Playback resumed.');
  }
};
