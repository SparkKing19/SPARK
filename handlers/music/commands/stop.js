'use strict';
module.exports = {
  name: 'stop',
  async execute(message, args, client, music) {
    const q = music.get(message.guild.id);
    if (!q?.player) return message.reply('I am not connected.');
    music.ensureSameVoice(message, q);
    q.tracks = [];
    q.loop = 'off';
    await q.player.stopTrack();
    return message.reply('Playback stopped and queue cleared.');
  }
};
