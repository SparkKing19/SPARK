require("dotenv").config();
const { Client, GatewayIntentBits, REST, Routes, Events } = require("discord.js");
const { MusicManager } = require("./music");
const { commandData, handleCommand } = require("./commands");

if (!process.env.DISCORD_TOKEN) {
  console.error("[CONFIG] Missing required environment variable: DISCORD_TOKEN");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});
const music = new MusicManager(client);

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  const body = commandData.map(c => c.toJSON());
  // The bot's application ID is its user ID; Discord.js exposes it after login.
  const applicationId = client.application.id;
  const route = Routes.applicationCommands(applicationId);
  await rest.put(route, { body });
  console.log(`[COMMANDS] Registered ${body.length} slash commands.`);
}

client.once(Events.ClientReady, async readyClient => {
  console.log(`[BOT] Logged in as ${readyClient.user.tag}`);
  try { await registerCommands(); }
  catch (error) { console.error("[COMMANDS] Registration failed:", error); }
  music.connect();
});

// Forward Discord voice gateway payloads to the bundled Lavalink node.
client.on("raw", packet => {
  if (packet.t === "VOICE_STATE_UPDATE") {
    music.onVoiceState(packet.d).catch(error => console.error("[VOICE STATE]", error));
  } else if (packet.t === "VOICE_SERVER_UPDATE") {
    music.onVoiceServer(packet.d).catch(error => console.error("[VOICE SERVER]", error));
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  try {
    await handleCommand(interaction, music);
  } catch (error) {
    console.error(`[COMMAND] /${interaction.commandName}:`, error);
    const message = "Something went wrong while handling that command.";
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: message, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
    }
  }
});

client.on(Events.Error, error => console.error("[DISCORD]", error));
process.on("unhandledRejection", error => console.error("[UNHANDLED]", error));
process.on("uncaughtException", error => {
  console.error("[FATAL]", error);
  process.exit(1);
});

client.login(process.env.DISCORD_TOKEN);