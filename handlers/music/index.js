'use strict';

const MusicManager = require('./lib/MusicManager');
const { loadMusicCommands } = require('./lib/loadCommands');

function setupMusic(client, options = {}) {
  const manager = new MusicManager(client, options);
  const commands = loadMusicCommands();

  // Use this from your existing messageCreate prefix handler:
  // const handled = await music.handleMessage(message, prefix);
  return {
    manager,
    commands,
    async handleMessage(message, prefix = '%') {
      if (!message?.guild || message.author?.bot) return false;
      const content = message.content || '';
      if (!content.startsWith(prefix)) return false;

      const [rawName, ...args] = content.slice(prefix.length).trim().split(/\s+/);
      if (!rawName) return false;

      const command = commands.get(rawName.toLowerCase());
      if (!command) return false;

      try {
        await command.execute(message, args, client, manager);
      } catch (error) {
        console.error(`[music:${rawName}]`, error);
        await message.reply('Something went wrong while running that music command. Check the bot logs and Lavalink connection.');
      }
      return true;
    }
  };
}

module.exports = { setupMusic, MusicManager };
