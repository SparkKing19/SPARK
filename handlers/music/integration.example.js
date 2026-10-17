'use strict';

// Example only: adapt this to your existing index.js and Shoukaku version.
const { Client, GatewayIntentBits } = require('discord.js');
const { Shoukaku, Connectors } = require('shoukaku');
const { setupMusic } = require('./index');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent
  ]
});

const nodes = [{
  name: 'main',
  url: `${process.env.LAVALINK_HOST}:${process.env.LAVALINK_PORT}`,
  auth: process.env.LAVALINK_PASSWORD,
  secure: process.env.LAVALINK_SECURE === 'true'
}];

client.shoukaku = new Shoukaku(new Connectors.DiscordJS(client), nodes);
const music = setupMusic(client);

client.on('messageCreate', async message => {
  await music.handleMessage(message, process.env.PREFIX || '%');
});

client.login(process.env.DISCORD_TOKEN);
