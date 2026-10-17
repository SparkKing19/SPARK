'use strict';
module.exports = {
  name: 'volume',
  aliases: ['vol'],
  async execute(message, args, client, music) {
    const q = music.get(message.guild.id);
    if (!q?.player) return message.reply('I am not connected.');
    music.ensureSameVoice(message, q);
    if (!args[0]) return message.reply(`Current volume: **${q.volume}%**`);
    const value = Number.parseInt(args[0], 10);
    if (!Number.isInteger(value) || value < 0 || value > 100) return message.reply('Volume must be a number from 0 to 100.');
    q.volume = value;
    await q.player.setGlobalVolume(value / 100);
    return message.reply(`Volume set to **${value}%**.`);
  }
};
