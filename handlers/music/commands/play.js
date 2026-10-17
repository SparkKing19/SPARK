'use strict';
module.exports = {
  name: 'play',
  aliases: ['p'],
  async execute(message, args, client, music) {
    const query = args.join(' ').trim();
    if (!query) return message.reply('Usage: `%play <song name or URL>`');
    await music.add(message, query);
  }
};
