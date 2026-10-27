const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Events, ActivityType } = require('discord.js');
const { Shoukaku, Connectors } = require('shoukaku');
const config = require('./config');
const E = require('./emojis');

if (!config.token) {
  console.error('Missing DISCORD_TOKEN. Add DISCORD_TOKEN in Railway Variables. (TOKEN is also supported.)');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent // enable in Developer Portal -> Bot -> Privileged Intents
  ],
  allowedMentions: { parse: [], repliedUser: false }
});

// ---- Lavalink ----
client.shoukaku = new Shoukaku(new Connectors.DiscordJS(client), config.nodes, {
  moveOnDisconnect: false, resume: false, reconnectTries: 20, restTimeout: 15000
});
client.shoukaku.on('ready', (name) => console.log(`[lavalink] ${name} connected`));
client.shoukaku.on('error', (name, err) => console.error(`[lavalink] ${name} error:`, err.message));
client.shoukaku.on('close', (name, code) => console.warn(`[lavalink] ${name} closed (${code})`));
client.shoukaku.on('disconnect', (name) => console.warn(`[lavalink] ${name} disconnected`));

// ---- Commands (every file in src/commands exports an array of commands) ----
client.commands = new Map();
client.commandList = [];
for (const file of fs.readdirSync(path.join(__dirname, 'commands')).filter((f) => f.endsWith('.js'))) {
  for (const cmd of require(path.join(__dirname, 'commands', file))) {
    client.commandList.push(cmd);
    for (const n of [cmd.name, ...(cmd.aliases || [])]) {
      if (client.commands.has(n)) console.warn(`[commands] duplicate name/alias: ${n}`);
      client.commands.set(n, cmd);
    }
  }
}
console.log(`[commands] ${client.commandList.length} commands loaded`);

// ---- Events ----
client.on(Events.MessageCreate, (m) => require('./events/messageCreate')(client, m).catch((e) => console.error(e)));
client.on(Events.VoiceStateUpdate, (o, n) => require('./events/voiceStateUpdate')(client, o, n).catch((e) => console.error(e)));

client.once(Events.ClientReady, async () => {
  console.log(`[bot] logged in as ${client.user.tag}`);
  client.user.setActivity(`${config.prefix}help | music`, { type: ActivityType.Listening });
  try { await E.load(client); console.log('[emojis] custom emojis loaded'); }
  catch { console.log('[emojis] none loaded (run `npm run emojis` to upload custom ones)'); }
});

process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
client.login(config.token);
