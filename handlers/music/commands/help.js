'use strict';
module.exports = {
  name: 'musichelp',
  aliases: ['mhelp'],
  async execute(message) {
    return message.reply([
      '**Music Commands**',
      '`%play <name/URL>` · `%join` · `%leave`',
      '`%pause` · `%resume` · `%skip` · `%stop`',
      '`%queue [page]` · `%nowplaying` · `%volume <0-100>`',
      '`%loop off|track|queue` · `%shuffle` · `%remove <position>`',
      '`%clear` · `%seek <seconds>` · `%musichelp`'
    ].join('\n'));
  }
};
