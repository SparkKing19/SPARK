'use strict';
module.exports = {
  name: 'remove',
  aliases: ['rm'],
  async execute(message, args, client, music) {
    const q = music.get(message.guild.id);
    if (!q?.tracks.length) return message.reply('The queue is empty.');
    music.ensureSameVoice(message, q);
    const position = Number.parseInt(args[0], 10);
    if (!Number.isInteger(position) || position < 1 || position > q.tracks.length) {
      return message.reply(`Usage: \`%remove <position>\` (1-${q.tracks.length})`);
    }
    const [track] = q.tracks.splice(position - 1, 1);
    return message.reply(`Removed **${track.title}** from the queue.`);
  }
};
