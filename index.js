const { 
  Client, 
  GatewayIntentBits, 
  Partials, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  StringSelectMenuBuilder, 
  EmbedBuilder 
} = require("discord.js");
const { Player } = require("discord-player");
const { SoundCloudExtractor } = require("@discord-player/extractor");

// Configuration
const TOKEN = process.env.DISCORD_TOKEN;
const PREFIX = process.env.PREFIX || "+";

if (!TOKEN) {
  console.error("[config] DISCORD_TOKEN missing!");
  process.exit(1);
}

const ffmpegPath = "ffmpeg";
console.log("[ffmpeg] Using system binary from PATH:", ffmpegPath);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Channel]
});

const player = new Player(client, {
  ffmpegPath,
  skipFFmpeg: false
});

// Map to store active session controllers, panel references, and 24/7 settings per guild
const activeControllers = new Map(); // guildId -> { controllerUserId, panelMessageId, autoplay, permanentVcId, musicChannelId }

function queueOptions(channel) {
  return {
    metadata: channel,
    volume: 100,
    selfDeaf: true,
    leaveOnEmpty: false,
    leaveOnEmptyCooldown: 60000,
    leaveOnEnd: false,
    leaveOnStop: false,
    bufferingTimeout: 30000,
    skipOnNoStream: false
  };
}

function getQueue(guildId) {
  return player.nodes.get(guildId);
}

function userVoice(message) {
  return message.member?.voice?.channel;
}

function botVoice(message) {
  return message.guild.members.me?.voice?.channel;
}

function sameVoice(message) {
  const bot = botVoice(message);
  const user = userVoice(message);
  return !bot || (user && bot.id === user.id);
}

// Helper: Check if user has music access (must be in bot's VC)
function hasMusicAccess(message) {
  const session = activeControllers.get(message.guild.id);
  const uVoice = userVoice(message);
  const bVoice = botVoice(message);

  if (!bVoice) return true; 
  if (!uVoice || uVoice.id !== bVoice.id) return false;

  if (!session || !session.controllerUserId) {
    activeControllers.set(message.guild.id, { ...(session || {}), controllerUserId: message.author.id });
    return true;
  }

  return session.controllerUserId === message.author.id;
}

async function checkPermissions(message, channel) {
  const permissions = channel.permissionsFor(message.guild.members.me);
  if (!permissions?.has("Connect")) {
    await message.reply("❌ I need Connect permission!");
    return false;
  }
  if (!permissions?.has("Speak")) {
    await message.reply("❌ I need Speak permission!");
    return false;
  }
  return true;
}

// Update Channel Status (Name with emoji `<a:music:1567533198983041135>`)
async function updateVoiceChannelStatus(queue, track) {
  try {
    const vc = queue.channel;
    if (!vc) return;
    const baseName = vc.name.replace(/^<a:music:\d+>\s*/, "").replace(/^🎵\s*/, "");
    if (track) {
      await vc.setName(`<a:music:1567533198983041135> ${baseName.slice(0, 90)}`).catch(() => {});
    } else {
      await vc.setName(baseName.slice(0, 95)).catch(() => {});
    }
  } catch (e) {}
}

// Build Black Embed Music Panel Components
function getPanelComponents() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("music_pause_resume").setEmoji("⏯️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("music_skip").setEmoji("⏭️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("music_stop").setEmoji("⏹️").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("music_autoplay").setEmoji("🔁").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("music_queue").setEmoji("📜").setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("music_filters")
      .setPlaceholder("Select Audio Filter...")
      .addOptions([
        { label: "Normal", value: "filter_off", description: "Clear all filters" },
        { label: "Bassboost", value: "filter_bassboost", description: "Boost low frequencies" },
        { label: "8D Audio", value: "filter_8d", description: "Spatial audio effect" },
        { label: "Nightcore", value: "filter_nightcore", description: "Higher pitch and speed" },
        { label: "Vaporwave", value: "filter_vaporwave", description: "Lower pitch and speed" }
      ])
  );

  return [row1, row2];
}

async function updateMusicPanel(queue, clientInstance, targetChannel = null) {
  const session = activeControllers.get(queue.guild.id) || {};
  const channelId = targetChannel?.id || session.musicChannelId;
  if (!channelId) return;

  try {
    const channel = await clientInstance.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    const track = queue.currentTrack;

    const embed = new EmbedBuilder()
      .setColor(0x000000) // Black embed
      .setTitle("🎧 SparkToon Music Control Panel")
      .setDescription(track ? `Playing: **${track.title}**` : "Queue is empty. Use `+play` or panel controls.")
      .addFields(
        { name: "Author", value: track?.author || "N/A", inline: true },
        { name: "Duration", value: track?.duration || "N/A", inline: true },
        { name: "Autoplay", value: session.autoplay ? "Enabled 🔁" : "Disabled", inline: true }
      );

    if (track?.thumbnail) {
      embed.setImage(track.thumbnail);
    }

    embed.setFooter({ text: "Powered by SparkCore & SoundCloud" });

    if (session.panelMessageId && !targetChannel) {
      const msg = await channel.messages.fetch(session.panelMessageId).catch(() => null);
      if (msg) {
        await msg.edit({ embeds: [embed], components: getPanelComponents() }).catch(() => {});
        return;
      }
    }

    const sentMsg = await channel.send({ embeds: [embed], components: getPanelComponents() });
    activeControllers.set(queue.guild.id, { ...session, panelMessageId: sentMsg.id, musicChannelId: channel.id });
  } catch (e) {
    console.error("[PANEL ERROR]", e);
  }
}

client.once("ready", () => {
  console.log(`[ready] Logged in as ${client.user.tag}`);
  console.log(`[ready] Prefix: ${PREFIX}`);
  console.log("[ready] Music Bot V2 Active with +247 & +panel");
});

// Player Events
player.events.on("playerStart", async (queue, track) => {
  console.log("[PLAYING]", track.title);
  await updateVoiceChannelStatus(queue, track);
  await updateMusicPanel(queue, client);

  queue.metadata?.send(
    `<a:DISK:1564099400182272050> 🎶 **Now Playing:** [${track.title}](${track.url})`
  ).catch(() => {});
});

player.events.on("audioTrackAdd", async (queue, track) => {
  console.log("[QUEUE ADD]", track.title);
  await updateMusicPanel(queue, client);
});

player.events.on("playerSkip", async (queue, track) => {
  console.error("[PLAYER SKIP]", track?.title);
  await updateMusicPanel(queue, client);
});

player.events.on("playerError", async (queue, error, track) => {
  console.error("[PLAYER ERROR]", track?.title, error);
  await updateMusicPanel(queue, client);
});

player.events.on("emptyQueue", async (queue) => {
  console.log("[QUEUE] Finished");
  const session = activeControllers.get(queue.guild.id) || {};
  
  if (session.autoplay && queue.history.size > 0) {
    const lastTrack = queue.history.tracks.at(-1);
    if (lastTrack) {
      queue.node.play(lastTrack);
      return;
    }
  }

  await updateVoiceChannelStatus(queue, null);
  await updateMusicPanel(queue, client);

  // If 24/7 channel is not set, leave VC if empty
  if (!session.permanentVcId && queue.channel && queue.channel.members.size <= 1) {
    queue.delete();
  }
});

// Voice State Tracking for Auto-Leave & Controller Reset
client.on("voiceStateUpdate", async (oldState, newState) => {
  const guildId = oldState.guild.id;
  const queue = getQueue(guildId);
  if (!queue || !queue.channel) return;

  const botChannelId = queue.channel.id;
  const session = activeControllers.get(guildId) || {};

  if (oldState.channelId === botChannelId && newState.channelId !== botChannelId) {
    if (session.controllerUserId && oldState.member?.id === session.controllerUserId) {
      activeControllers.set(guildId, { ...session, controllerUserId: null });
      queue.metadata?.send("⚠️ The music controller left the voice channel. Anyone in the VC can now take control.").catch(() => {});
    }

    const vcMembers = queue.channel.members.filter(m => !m.user.bot);
    if (vcMembers.size === 0) {
      if (!session.permanentVcId || botChannelId !== session.permanentVcId) {
        setTimeout(async () => {
          const currentQueue = getQueue(guildId);
          if (currentQueue && currentQueue.channel) {
            const recheckMembers = currentQueue.channel.members.filter(m => !m.user.bot);
            if (recheckMembers.size === 0) {
              await updateVoiceChannelStatus(currentQueue, null);
              currentQueue.delete();
              activeControllers.delete(guildId);
            }
          }
        }, 10000);
      }
    }
  }
});

// Help Text (Short & Clean English, Black Embed format)
const helpText = [
  "**🎧 SparkToon Music Bot**",
  "",
  "`+join` - Join voice channel",
  "`+play <song>` - Play track from SoundCloud",
  "`+pause` - Pause playback",
  "`+resume` - Resume playback",
  "`+skip` - Skip current track",
  "`+stop` - Stop and clear queue",
  "`+queue` - Show upcoming queue",
  "`+autoplay` - Toggle repeat/autoplay",
  "`+247` - Set current channel as 24/7",
  "`+panel` - Send music control panel",
  "`+help` - List commands",
  "",
  "<a:DISK:1564099400182272050> *Only users in the bot's voice channel can execute controls.*"
].join("\n");

// Command Handler
client.on("messageCreate", async (message) => {
  if (!message.guild || message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = (args.shift() || "").toLowerCase();

  if (!command) return;

  try {
    // HELP
    if (command === "help" || command === "commands") {
      const embed = new EmbedBuilder().setColor(0x000000).setDescription(helpText);
      return message.reply({ embeds: [embed] });
    }

    // JOIN
    if (command === "join") {
      const session = activeControllers.get(message.guild.id) || {};
      const channel = userVoice(message) || (session.permanentVcId ? await message.guild.channels.fetch(session.permanentVcId).catch(() => null) : null);

      if (!channel) {
        return message.reply("❌ Join a voice channel first!");
      }

      if (!(await checkPermissions(message, channel))) return;

      let queue = getQueue(message.guild.id);
      if (!queue) {
        queue = player.nodes.create(message.guild, queueOptions(message.channel));
      }

      await queue.connect(channel);
      activeControllers.set(message.guild.id, { ...session, controllerUserId: message.author.id });

      const embed = new EmbedBuilder().setColor(0x000000).setDescription(`✅ Joined **${channel.name}**`);
      return message.reply({ embeds: [embed] });
    }

    // PLAY
    if (command === "play" || command === "p") {
      const query = args.join(" ").trim();
      if (!query) {
        return message.reply("❌ Enter a song name or SoundCloud link!");
      }

      const session = activeControllers.get(message.guild.id) || {};
      const channel = userVoice(message) || (session.permanentVcId ? await message.guild.channels.fetch(session.permanentVcId).catch(() => null) : null);

      if (!channel) {
        return message.reply("❌ You must be in a voice channel to play music!");
      }

      if (botVoice(message) && !sameVoice(message)) {
        return message.reply("❌ I am active in another voice channel!");
      }

      if (!hasMusicAccess(message)) {
        return message.reply("❌ Another user currently controls the music in this voice channel. Join the VC to take control.");
      }

      if (!(await checkPermissions(message, channel))) return;

      await message.channel.sendTyping();

      const searchResult = await player.search(query, {
        searchEngine: `ext:${SoundCloudExtractor.identifier}`,
        requestedBy: message.author
      });

      if (!searchResult.hasTracks()) {
        return message.reply("❌ No playable SoundCloud tracks found.");
      }

      const result = await player.play(channel, searchResult, {
        nodeOptions: { ...queueOptions(message.channel) }
      });

      const embed = new EmbedBuilder()
        .setColor(0x000000)
        .setDescription(`<a:DISK:1564099400182272050> Added to queue: **${result.track.title}**`);
      
      return message.reply({ embeds: [embed] });
    }

    // 24/7 COMMAND (`+247`)
    if (command === "247" || command === "set247") {
      const channel = userVoice(message);
      if (!channel) {
        return message.reply("❌ Join a voice channel first to set it as 24/7!");
      }

      if (!hasMusicAccess(message)) {
        return message.reply("❌ You must be in the bot's voice channel to configure 24/7 mode!");
      }

      const session = activeControllers.get(message.guild.id) || {};
      session.permanentVcId = channel.id;
      session.musicChannelId = message.channel.id;
      activeControllers.set(message.guild.id, session);

      const embed = new EmbedBuilder()
        .setColor(0x000000)
        .setDescription(`✅ **24/7 Mode Enabled!**\nVoice Channel: **${channel.name}**\nPanel Channel: **${message.channel.name}**`);
      
      return message.reply({ embeds: [embed] });
    }

    // PANEL COMMAND (`+panel`)
    if (command === "panel") {
      const queue = getQueue(message.guild.id);
      if (!queue) {
        return message.reply("❌ Music player is not active. Play a song first!");
      }

      await updateMusicPanel(queue, client, message.channel);
      const embed = new EmbedBuilder().setColor(0x000000).setDescription("✅ Music control panel sent here.");
      return message.reply({ embeds: [embed] });
    }

    // STOP
    if (command === "stop") {
      const queue = getQueue(message.guild.id);
      if (!queue) return message.reply("❌ Nothing is playing.");
      if (!hasMusicAccess(message)) return message.reply("❌ Join my voice channel to control playback!");

      queue.delete();
      activeControllers.delete(message.guild.id);
      await updateVoiceChannelStatus(queue, null);

      const embed = new EmbedBuilder().setColor(0x000000).setDescription("⏹️ Playback stopped and queue cleared.");
      return message.reply({ embeds: [embed] });
    }

    // PAUSE
    if (command === "pause") {
      const queue = getQueue(message.guild.id);
      if (!queue?.isPlaying()) return message.reply("❌ Nothing is playing.");
      if (!hasMusicAccess(message)) return message.reply("❌ Join my voice channel to control playback!");

      queue.node.setPaused(true);
      const embed = new EmbedBuilder().setColor(0x000000).setDescription("⏸️ Music paused.");
      return message.reply({ embeds: [embed] });
    }

    // RESUME
    if (command === "resume" || command === "unpause") {
      const queue = getQueue(message.guild.id);
      if (!queue || !queue.node.isPaused()) return message.reply("❌ Music is not paused.");
      if (!hasMusicAccess(message)) return message.reply("❌ Join my voice channel to control playback!");

      queue.node.setPaused(false);
      const embed = new EmbedBuilder().setColor(0x000000).setDescription("▶️ Music resumed.");
      return message.reply({ embeds: [embed] });
    }

    // SKIP
    if (command === "skip" || command === "s") {
      const queue = getQueue(message.guild.id);
      if (!queue?.isPlaying()) return message.reply("❌ Nothing to skip.");
      if (!hasMusicAccess(message)) return message.reply("❌ Join my voice channel to control playback!");

      queue.node.skip();
      const embed = new EmbedBuilder().setColor(0x000000).setDescription("⏭️ Track skipped.");
      return message.reply({ embeds: [embed] });
    }

    // QUEUE
    if (command === "queue" || command === "q") {
      const queue = getQueue(message.guild.id);
      if (!queue?.currentTrack) return message.reply("❌ Queue is empty.");

      const upcoming = queue.tracks.toArray().slice(0, 10);
      const lines = upcoming.map((track, index) => `**${index + 1}.** ${track.title}`);

      const embed = new EmbedBuilder()
        .setColor(0x000000)
        .setDescription([
          `🎶 **Now Playing:** ${queue.currentTrack.title}`,
          "",
          "**Up Next:**",
          ...(lines.length ? lines : ["No upcoming tracks."])
        ].join("\n"));

      return message.reply({ embeds: [embed] });
    }

    // AUTOPLAY
    if (command === "autoplay" || command === "repeat") {
      const queue = getQueue(message.guild.id);
      if (!queue) return message.reply("❌ Music player is not active.");
      if (!hasMusicAccess(message)) return message.reply("❌ Join my voice channel to control playback!");

      const session = activeControllers.get(message.guild.id) || {};
      session.autoplay = !session.autoplay;
      activeControllers.set(message.guild.id, session);
      await updateMusicPanel(queue, client);

      const embed = new EmbedBuilder()
        .setColor(0x000000)
        .setDescription(`🔁 Autoplay is now **${session.autoplay ? "Enabled" : "Disabled"}**.`);
      return message.reply({ embeds: [embed] });
    }

  } catch (error) {
    console.error(`[COMMAND ERROR: ${command}]`, error);
    const embed = new EmbedBuilder().setColor(0x000000).setDescription(`❌ **${command} failed:** \`${error.message}\``);
    return message.reply({ embeds: [embed] }).catch(() => {});
  }
});

// Interaction Handler for Panel Buttons & Dropdown Filters
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isMessageComponent()) return;
  const guildId = interaction.guild?.id;
  const queue = getQueue(guildId);

  const botVC = interaction.guild?.members.me?.voice?.channel;
  const userVC = interaction.member?.voice?.channel;

  if (botVC && (!userVC || userVC.id !== botVC.id)) {
    return interaction.reply({ content: "❌ You must be in the bot's voice channel to use this panel!", ephemeral: true });
  }

  if (interaction.customId === "music_pause_resume") {
    if (!queue) return interaction.reply({ content: "❌ Nothing is playing.", ephemeral: true });
    queue.node.setPaused(!queue.node.isPaused());
    await updateMusicPanel(queue, client);
    return interaction.reply({ content: `🎵 Playback toggled.`, ephemeral: true });
  }

  if (interaction.customId === "music_skip") {
    if (!queue) return interaction.reply({ content: "❌ Nothing to skip.", ephemeral: true });
    queue.node.skip();
    return interaction.reply({ content: `⏭️ Track skipped.`, ephemeral: true });
  }

  if (interaction.customId === "music_stop") {
    if (!queue) return interaction.reply({ content: "❌ Nothing is playing.", ephemeral: true });
    queue.delete();
    activeControllers.delete(guildId);
    await updateVoiceChannelStatus(queue, null);
    return interaction.reply({ content: `⏹️ Playback stopped.`, ephemeral: true });
  }

  if (interaction.customId === "music_autoplay") {
    if (!queue) return interaction.reply({ content: "❌ Music player not active.", ephemeral: true });
    const session = activeControllers.get(guildId) || {};
    session.autoplay = !session.autoplay;
    activeControllers.set(guildId, session);
    await updateMusicPanel(queue, client);
    return interaction.reply({ content: `🔁 Autoplay: **${session.autoplay ? "Enabled" : "Disabled"}**`, ephemeral: true });
  }

  if (interaction.customId === "music_filters" && interaction.isStringSelectMenu()) {
    if (!queue) return interaction.reply({ content: "❌ Music player not active.", ephemeral: true });
    const val = interaction.values[0];
    const filters = queue.filters.ffmpeg;

    await filters.clear();
    if (val === "filter_bassboost") await filters.toggle(["bassboost", "normalizer"]);
    if (val === "filter_8d") await filters.toggle(["8D"]);
    if (val === "filter_nightcore") await filters.toggle(["nightcore"]);
    if (val === "filter_vaporwave") await filters.toggle(["vaporwave"]);

    return interaction.reply({ content: `🎛️ Applied filter: **${val.replace("filter_", "").toUpperCase()}**`, ephemeral: true });
  }
});

// Start Bot
async function start() {
  try {
    await player.extractors.register(SoundCloudExtractor);
    console.log("[extractors] SoundCloud loaded");
    await client.login(TOKEN);
  } catch (error) {
    console.error("[STARTUP ERROR]", error);
    process.exit(1);
  }
}

start(); 
