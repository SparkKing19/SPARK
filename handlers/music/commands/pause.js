'use strict';
module.exports = {
  name: 'pause',
  async execute(message, args, client, music) {
    const q = music.get(message.guild.id);
    if (!q?.player || !q.current) return message.reply('Nothing is playing.');
    music.ensureSameVoice(message, q);
    await q.player.setPaused(true);
    q.paused = true;
    return message.reply('Playback paused.');
  }
};
