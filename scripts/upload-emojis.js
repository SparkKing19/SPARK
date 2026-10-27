// Uploads every image in /emojis as an *application emoji* (works in every server the bot is in).
// File name = emoji key, e.g. emojis/play.png -> E('play'). Re-running skips existing ones.
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Events } = require('discord.js');
require('dotenv').config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.once(Events.ClientReady, async () => {
  const dir = path.join(__dirname, '..', 'emojis');
  const existing = await client.application.emojis.fetch();
  const files = fs.readdirSync(dir).filter((f) => /\.(png|gif|jpe?g|webp)$/i.test(f));
  for (const f of files) {
    const name = path.parse(f).name.replace(/[^a-zA-Z0-9_]/g, '_');
    if (existing.some((e) => e.name === name)) { console.log(`skip   ${name} (already exists)`); continue; }
    try {
      await client.application.emojis.create({ attachment: path.join(dir, f), name });
      console.log(`added  ${name}`);
    } catch (e) { console.log(`failed ${name}: ${e.message}`); }
  }
  console.log('Done. Restart the bot to use them.');
  client.destroy();
});
client.login(process.env.TOKEN);
