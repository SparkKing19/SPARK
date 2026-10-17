'use strict';
module.exports = {
  name: 'seek',
  async execute(message, args, client, music) {
    const q = music.get(message.guild.id);
    if (!q?.player || !q.current) return message.reply('Nothing is playing.');
    music.ensureSameVoice(message, q);
    const seconds = Number(args[0]);
    if (!Number.isFinite(seconds) || seconds < 0) return message.reply('Usage: `%seek <seconds>`');
    if (!q.current.length || seconds * 1000 >= q.current.length) return message.reply('Seek position must be inside the track duration.');
    await q.player.seekTo(Math.floor(seconds * 1000));
    return message.reply(`Seeked to **${music.formatTime(seconds * 1000)}**.`);
  }
};
