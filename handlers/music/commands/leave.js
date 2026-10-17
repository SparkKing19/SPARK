'use strict';
module.exports = {
  name: 'leave',
  aliases: ['disconnect', 'dc'],
  async execute(message, args, client, music) {
    const queue = music.get(message.guild.id);
    if (!queue) return message.reply('I am not playing in this server.');
    music.ensureSameVoice(message, queue);
    await music.disconnect(message.guild.id);
    return message.reply('Disconnected and cleared the queue.');
  }
};
