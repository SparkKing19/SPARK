'use strict';

const fs = require('node:fs');
const path = require('node:path');

function loadMusicCommands() {
  const directory = path.join(__dirname, '..', 'commands');
  const commands = new Map();
  for (const file of fs.readdirSync(directory).filter(file => file.endsWith('.js'))) {
    const command = require(path.join(directory, file));
    if (command.name && typeof command.execute === 'function') {
      commands.set(command.name, command);
      for (const alias of command.aliases ?? []) commands.set(alias, command);
    }
  }
  return commands;
}

module.exports = { loadMusicCommands };
