'use strict';
module.exports = {
  name: 'join',
  aliases: ['summon'],
  async execute(message, args, client, music) {
    const queue = await music.connect(message);
    await message.reply(`Joined **${message.member.voice.channel.name}**.`);
    return queue;
  }
};
