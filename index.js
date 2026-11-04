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
const { YouTubeDlpExtractor } = require("discord-player-youtubedlp");

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

const activeControllers = new Map(); 

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
  if (!permissions?.has("Connect") || !permissions?.has("Speak")) {
    await message.reply("❌ I need Connect and Speak permissions!");
    return false;
  }
  return true;
}

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

function getDiscEmoji(clientInstance) {
  const customDisc = clientInstance.emojis.cache.get("1564099400182272050");
  if (customDisc) return `<a:DISK:${customDisc.id}>`;
  return "💽";
}

// Panel Buttons Layout (Exact 10 Buttons layout)
function getPanelComponents(clientInstance) {
  const disc = getDiscEmoji(clientInstance);

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("music_loop").setEmoji("🔁").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("music_prev").setEmoji("⏮️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("music_stop").setEmoji("⏹️").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("music_skip").setEmoji("⏭️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("music_queue").setEmoji("🗃️").setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("music_vol_down").setEmoji("🔉").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("music_pause").setEmoji("⏸️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("music_panel_disc").setEmoji(disc.includes(":") ? { id: "1564099400182272050", name: "DISK" } : "💽").setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId("music_resume").setEmoji("▶️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("music_vol_up").setEmoji("🔊").setStyle(ButtonStyle.Secondary)
  );

  const row3 = new ActionRowBuilder().addComponents(
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

  return [row1, row2, row3];
}

async function updateMusicPanel(queue, clientInstance, targetChannel = null) {
  const session = activeControllers.get(queue.guild.id) || {};
  const channelId = targetChannel?.id || session.musicChannelId;
  if (!channelId) return;

  try {
    const channel = await clientInstance.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    const track = queue.currentTrack;
    const disc = getDiscEmoji(clientInstance);

    const embed = new EmbedBuilder()
      .setColor(0x000000)
      .setTitle(`${disc} SparkToon Permanent Music Panel`)
      .setDescription(track ? `Playing: **${track.title}**` : "Queue is empty. Use `+play` or panel controls.")
      .addFields(
        { name: "Author", value: track?.author || "N/A", inline: true },
        { name: "Name", value: track?.title || "N/A", inline: true },
        { name: "Time", value: track?.duration || "N/A", inline: true },
        { name: "Loop", value: session.loopMode ? "Enabled 🔁" : "Disabled", inline: true },
        { name: "Volume", value: `${queue.node.volume}%`, inline: true }
      );

    if (track?.thumbnail) {
      embed.setImage(track.thumbnail);
    }

    embed.setFooter({ text: "Powered by SparkCore & YouTube/SoundCloud" });

    if (session.panelMessageId && !targetChannel) {
      const msg = await channel.messages.fetch(session.panelMessageId).catch(() => null);
      if (msg) {
        await msg.edit({ embeds: [embed], components: getPanelComponents(clientInstance) }).catch(() => {});
        return;
      }
    }

    const sentMsg = await channel.send({ embeds: [embed], components: getPanelComponents(clientInstance) });
    activeControllers.set(queue.guild.id, { ...session, panelMessageId: sentMsg.id, musicChannelId: channel.id });
  } catch (e) {
    console.error("[PANEL ERROR]", e);
  }
}

client.once("ready", () => {
  console.log(`[ready] Logged in as ${client.user.tag}`);
  console.log(`[ready] Prefix: ${PREFIX}`);
  console.log("[ready] Music Bot Permanent Panel V4 (YouTube + SoundCloud) Active");
});

player.events.on("playerStart", async (queue, track) => {
  console.log("[PLAYING]", track.title);
  await updateVoiceChannelStatus(queue, track);
  await updateMusicPanel(queue, client);

  const disc = getDiscEmoji(client);
  queue.metadata?.send(
    `${disc} 🎶 **Now Playing:** [${track.title}](${track.url})`
  ).catch(() => {});
});

player.events.on("audioTrackAdd", async (queue, track) => {
  await updateMusicPanel(queue, client);
});

player.events.on("playerSkip", async (queue, track) => {
  await updateMusicPanel(queue, client);
});

player.events.on("playerError", async (queue, error, track) => {
  await updateMusicPanel(queue, client);
});

player.events.on("emptyQueue", async (queue) => {
  const session = activeControllers.get(queue.guild.id) || {};
  
  if (session.loopMode && queue.history.size > 0) {
    const lastTrack = queue.history.tracks.at(-1);
    if (lastTrack) {
      queue.node.play(lastTrack);
      return;
    }
  }

  await updateVoiceChannelStatus(queue, null);
  await updateMusicPanel(queue, client);

  if (!session.permanentVcId && queue.channel && queue.channel.members.size <= 1) {
    queue.delete();
  }
});

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

const helpText = [
  "**🎧 SparkToon Music Bot**",
  "",
  "`+join` - Join voice channel",
  "`+play <song/url>` - Play track from YouTube or SoundCloud",
  "`+pause` - Pause playback",
  "`+resume` - Resume playback",
  "`+skip` - Skip current track",
  "`+stop` - Stop and clear queue",
  "`+queue` - Show upcoming queue",
  "`+autoplay` - Toggle loop",
  "`+247` - Set current channel as 24/7",
  "`+panel` - Set permanent music panel here",
  "`+help` - List commands",
  "",
  "🔒 *Only users in the bot's voice channel can control playback.*"
].join("\n");

client.on("messageCreate", async (message) => {
  if (!message.guild || message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = (args.shift() || "").toLowerCase();

  if (!command) return;

  try {
    if (command === "help" || command === "commands") {
      const embed = new EmbedBuilder().setColor(0x000000).setDescription(helpText);
      return message.reply({ embeds: [embed] });
    }

    if (command === "join") {
      const session = activeControllers.get(message.guild.id) || {};
      const channel = userVoice(message) || (session.permanentVcId ? await message.guild.channels.fetch(session.permanentVcId).catch(() => null) : null);

      if (!channel) return message.reply("❌ Join a voice channel first!");
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

    if (command === "play" || command === "p") {
      const query = args.join(" ").trim();
      if (!query) return message.reply("❌ Enter a song name or YouTube/SoundCloud link!");

      const session = activeControllers.get(message.guild.id) || {};
      const channel = userVoice(message) || (session.permanentVcId ? await message.guild.channels.fetch(session.permanentVcId).catch(() => null) : null);

      if (!channel) return message.reply("❌ You must be in a voice channel to play music!");
      if (botVoice(message) && !sameVoice(message)) return message.reply("❌ I am active in another voice channel!");
      if (!hasMusicAccess(message)) return message.reply("❌ Another user currently controls the music in this voice channel.");

      if (!(await checkPermissions(message, channel))) return;
      await message.channel.sendTyping();

      // Searches across YouTube & SoundCloud automatically via registered extractors
      const searchResult = await player.search(query, {
        requestedBy: message.author
      });

      if (!searchResult.hasTracks()) return message.reply("❌ No playable tracks found on YouTube or SoundCloud.");

      const result = await player.play(channel, searchResult, {
        nodeOptions: { ...queueOptions(message.channel) }
      });

      const disc = getDiscEmoji(client);
      const embed = new EmbedBuilder()
        .setColor(0x000000)
        .setDescription(`${disc} Added to queue: **${result.track.title}**`);
      
      return message.reply({ embeds: [embed] });
    }

    if (command === "247" || command === "set247") {
      const channel = userVoice(message);
      if (!channel) return message.reply("❌ Join a voice channel first to set it as 24/7!");
      if (!hasMusicAccess(message)) return message.reply("❌ You must be in the bot's voice channel to configure 24/7 mode!");

      const session = activeControllers.get(message.guild.id) || {};
      session.permanentVcId = channel.id;
      session.musicChannelId = message.channel.id;
      activeControllers.set(message.guild.id, session);

      const embed = new EmbedBuilder()
        .setColor(0x000000)
        .setDescription(`✅ **24/7 Music Channel Enabled!**\nVoice Channel: **${channel.name}**\nPanel Channel: **${message.channel.name}**`);
      
      return message.reply({ embeds: [embed] });
    }

    if (command === "panel") {
      const session = activeControllers.get(message.guild.id) || {};
      session.musicChannelId = message.channel.id;
      activeControllers.set(message.guild.id, session);

      const queue = getQueue(message.guild.id);
      if (queue) {
        await updateMusicPanel(queue, client, message.channel);
      } else {
        const embed = new EmbedBuilder()
          .setColor(0x000000)
          .setTitle(`${getDiscEmoji(client)} SparkToon Permanent Music Panel`)
          .setDescription("Queue is empty. Use `+play` or panel controls.")
          .setFooter({ text: "Powered by SparkCore & YouTube/SoundCloud" });
        
        const sentMsg = await message.channel.send({ embeds: [embed], components: getPanelComponents(client) });
        session.panelMessageId = sentMsg.id;
        activeControllers.set(message.guild.id, session);
      }

      return message.reply("✅ Permanent music control panel has been set here.");
    }

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

    if (command === "pause") {
      const queue = getQueue(message.guild.id);
      if (!queue?.isPlaying()) return message.reply("❌ Nothing is playing.");
      if (!hasMusicAccess(message)) return message.reply("❌ Join my voice channel to control playback!");

      queue.node.setPaused(true);
      await updateMusicPanel(queue, client);
      const embed = new EmbedBuilder().setColor(0x000000).setDescription("⏸️ Music paused.");
      return message.reply({ embeds: [embed] });
    }

    if (command === "resume" || command === "unpause") {
      const queue = getQueue(message.guild.id);
      if (!queue || !queue.node.isPaused()) return message.reply("❌ Music is not paused.");
      if (!hasMusicAccess(message)) return message.reply("❌ Join my voice channel to control playback!");

      queue.node.setPaused(false);
      await updateMusicPanel(queue, client);
      const embed = new EmbedBuilder().setColor(0x000000).setDescription("▶️ Music resumed.");
      return message.reply({ embeds: [embed] });
    }

    if (command === "skip" || command === "s") {
      const queue = getQueue(message.guild.id);
      if (!queue?.isPlaying()) return message.reply("❌ Nothing to skip.");
      if (!hasMusicAccess(message)) return message.reply("❌ Join my voice channel to control playback!");

      queue.node.skip();
      const embed = new EmbedBuilder().setColor(0x000000).setDescription("⏭️ Track skipped.");
      return message.reply({ embeds: [embed] });
    }

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

    if (command === "autoplay" || command === "repeat") {
      const queue = getQueue(message.guild.id);
      if (!queue) return message.reply("❌ Music player is not active.");
      if (!hasMusicAccess(message)) return message.reply("❌ Join my voice channel to control playback!");

      const session = activeControllers.get(message.guild.id) || {};
      session.loopMode = !session.loopMode;
      activeControllers.set(message.guild.id, session);
      await updateMusicPanel(queue, client);

      const embed = new EmbedBuilder()
        .setColor(0x000000)
        .setDescription(`🔁 Loop mode is now **${session.loopMode ? "Enabled" : "Disabled"}**.`);
      return message.reply({ embeds: [embed] });
    }

  } catch (error) {
    console.error(`[COMMAND ERROR: ${command}]`, error);
    const embed = new EmbedBuilder().setColor(0x000000).setDescription(`❌ **${command} failed:** \`${error.message}\``);
    return message.reply({ embeds: [embed] }).catch(() => {});
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isMessageComponent()) return;
  const guildId = interaction.guild?.id;
  const queue = getQueue(guildId);

  const botVC = interaction.guild?.members.me?.voice?.channel;
  const userVC = interaction.member?.voice?.channel;

  if (botVC && (!userVC || userVC.id !== botVC.id)) {
    return interaction.reply({ content: "❌ You must be in the bot's voice channel to use this panel!", ephemeral: true });
  }

  const session = activeControllers.get(guildId) || {};

  if (interaction.customId === "music_loop") {
    session.loopMode = !session.loopMode;
    activeControllers.set(guildId, session);
    if (queue) await updateMusicPanel(queue, client);
    return interaction.reply({ content: `🔁 Loop mode: **${session.loopMode ? "Enabled" : "Disabled"}**`, ephemeral: true });
  }

  if (interaction.customId === "music_prev") {
    if (!queue || queue.history.size === 0) return interaction.reply({ content: "❌ No previous tracks available.", ephemeral: true });
    await queue.history.previous();
    return interaction.reply({ content: `⏮️ Playing previous track.`, ephemeral: true });
  }

  if (interaction.customId === "music_stop") {
    if (!queue) return interaction.reply({ content: "❌ Nothing is playing.", ephemeral: true });
    queue.delete();
    activeControllers.delete(guildId);
    await updateVoiceChannelStatus(queue, null);
    return interaction.reply({ content: `⏹️ Playback stopped.`, ephemeral: true });
  }

  if (interaction.customId === "music_skip") {
    if (!queue) return interaction.reply({ content: "❌ Nothing to skip.", ephemeral: true });
    queue.node.skip();
    return interaction.reply({ content: `⏭️ Track skipped.`, ephemeral: true });
  }

  if (interaction.customId === "music_queue") {
    if (!queue?.currentTrack) return interaction.reply({ content: "❌ Queue is empty.", ephemeral: true });
    const upcoming = queue.tracks.toArray().slice(0, 10).map((t, i) => `**${i + 1}.** ${t.title}`).join("\n");
    return interaction.reply({ content: `🗃️ **Now Playing:** ${queue.currentTrack.title}\n\n**Up Next:**\n${upcoming || "None"}`, ephemeral: true });
  }

  if (interaction.customId === "music_vol_down") {
    if (!queue) return interaction.reply({ content: "❌ Music player not active.", ephemeral: true });
    const newVol = Math.max(queue.node.volume - 10, 0);
    queue.node.setVolume(newVol);
    await updateMusicPanel(queue, client);
    return interaction.reply({ content: `🔉 Volume set to ${newVol}%`, ephemeral: true });
  }

  if (interaction.customId === "music_pause") {
    if (!queue?.isPlaying()) return interaction.reply({ content: "❌ Nothing is playing.", ephemeral: true });
    queue.node.setPaused(true);
    await updateMusicPanel(queue, client);
    return interaction.reply({ content: "⏸️ Music paused.", ephemeral: true });
  }

  if (interaction.customId === "music_resume") {
    if (!queue || !queue.node.isPaused()) return interaction.reply({ content: "❌ Music is not paused.", ephemeral: true });
    queue.node.setPaused(false);
    await updateMusicPanel(queue, client);
    return interaction.reply({ content: "▶️ Music resumed.", ephemeral: true });
  }

  if (interaction.customId === "music_vol_up") {
    if (!queue) return interaction.reply({ content: "❌ Music player not active.", ephemeral: true });
    const newVol = Math.min(queue.node.volume + 10, 100);
    queue.node.setVolume(newVol);
    await updateMusicPanel(queue, client);
    return interaction.reply({ content: `🔊 Volume set to ${newVol}%`, ephemeral: true });
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

async function start() {
  try {
    // Register both YouTube and SoundCloud extractors
    await player.extractors.register(YouTubeDlpExtractor, {});
    await player.extractors.register(SoundCloudExtractor, {});
    console.log("[extractors] YouTube & SoundCloud loaded successfully");

    await client.login(TOKEN);
  } catch (error) {
    console.error("[STARTUP ERROR]", error);
    process.exit(1);
  }
}

start();
