'use strict';
module.exports = {
  name: 'loop',
  aliases: ['repeat'],
  async execute(message, args, client, music) {
    const q = music.get(message.guild.id);
    if (!q) return message.reply('There is no active music session.');
    music.ensureSameVoice(message, q);
    const mode = (args[0] || '').toLowerCase();
    if (!['off', 'track', 'queue'].includes(mode)) return message.reply('Usage: `%loop off|track|queue`');
    q.loop = mode;
    return message.reply(`Loop mode set to **${mode}**.`);
  }
};
