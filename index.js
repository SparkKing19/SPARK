const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { Player } = require("discord-player");
const { SoundCloudExtractor } = require("@discord-player/extractor");

// Configuration
const TOKEN = process.env.DISCORD_TOKEN;
const PREFIX = process.env.PREFIX || "+";

if (!TOKEN) {
  console.error("[config] DISCORD_TOKEN missing!");
  process.exit(1);
}

// Use Railway's system FFmpeg. The discord-player FAQ warns that
// static ffmpeg binaries can cause audio to stop immediately.
const ffmpegPath = "ffmpeg";
console.log("[ffmpeg] Using system binary from PATH:", ffmpegPath);

// Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Channel]
});

// Force FFmpeg instead of allowing the raw/Opus bypass path implicated by
// the previous logs (skipFFmpeg: true with zero packets played).
const player = new Player(client, {
  ffmpegPath,
  skipFFmpeg: false
});

// Queue settings
function queueOptions(channel) {
  return {
    metadata: channel,
    volume: 100,
    selfDeaf: true,
    leaveOnEmpty: true,
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

// Ready
client.once("ready", () => {
  console.log(`[ready] Logged in as ${client.user.tag}`);
  console.log(`[ready] Prefix: ${PREFIX}`);
  console.log("[ready] SoundCloud V1 active");
});

// Debug logs
player.on("debug", (message) => {
  console.log("[PLAYER DEBUG]", message);
});

player.events.on("debug", (queue, message) => {
  console.log(`[QUEUE DEBUG ${queue.guild.id}]`, message);
});

// Player events
player.events.on("playerStart", (queue, track) => {
  console.log("[PLAYING]", track.title);

  queue.metadata?.send(
    `🎶 **Now Playing:** [${track.title}](${track.url})`
  ).catch(() => {});
});

player.events.on("audioTrackAdd", (queue, track) => {
  console.log("[QUEUE ADD]", track.title);

  queue.metadata?.send(
    `➕ Added: **${track.title}**`
  ).catch(() => {});
});

player.events.on("playerSkip", (queue, track) => {
  console.error("[PLAYER SKIP]", track?.title);

  queue.metadata?.send(
    `⚠️ Could not stream **${track?.title || "track"}**. Check Railway logs.`
  ).catch(() => {});
});

player.events.on("playerError", (queue, error, track) => {
  console.error("[PLAYER ERROR]", track?.title);
  console.error(error);

  queue.metadata?.send(
    `❌ Playback error: ${error.message || error}`
  ).catch(() => {});
});

player.events.on("error", (queue, error) => {
  console.error("[QUEUE ERROR]", error);
});

player.events.on("emptyQueue", (queue) => {
  console.log("[QUEUE] Finished");

  queue.metadata?.send("✅ Queue finished.").catch(() => {});
});

player.events.on("disconnect", (queue) => {
  console.log("[VOICE] Disconnected:", queue.guild.id);
});

// Help
const helpText = [
  "**🎧 SoundCloud Music Bot V1**",
  "",
  "`+join` - Join voice channel",
  "`+play <song>` - Play SoundCloud",
  "`+pause` - Pause music",
  "`+resume` - Resume music",
  "`+skip` - Skip track",
  "`+stop` - Stop music",
  "`+queue` - Show queue",
  "`+nowplaying` - Current song",
  "`+volume <1-100>` - Volume",
  "`+leave` - Leave voice channel",
  "`+help` - Commands",
  "",
  "Only SoundCloud supported in V1."
].join("\n");

// Commands
client.on("messageCreate", async (message) => {
  if (!message.guild || message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = (args.shift() || "").toLowerCase();

  if (!command) return;

  try {
    // HELP
    if (command === "help" || command === "commands") {
      return message.reply(helpText);
    }

    // JOIN
    if (command === "join") {
      const channel = userVoice(message);

      if (!channel) {
        return message.reply("❌ Join a voice channel first!");
      }

      if (!(await checkPermissions(message, channel))) return;

      let queue = getQueue(message.guild.id);

      if (!queue) {
        queue = player.nodes.create(
          message.guild,
          queueOptions(message.channel)
        );
      }

      await queue.connect(channel);

      return message.reply(`✅ Joined **${channel.name}**`);
    }

    // PLAY
    if (command === "play" || command === "p") {
      const query = args.join(" ").trim();

      if (!query) {
        return message.reply("❌ Enter a song name or SoundCloud link!");
      }

      const channel = userVoice(message);

      if (!channel) {
        return message.reply("❌ Join a voice channel first!");
      }

      if (!sameVoice(message)) {
        return message.reply("❌ I am already in another voice channel!");
      }

      if (!(await checkPermissions(message, channel))) return;

      await message.channel.sendTyping();

      console.log("[SEARCH]", query);

      // Force SoundCloud extractor
      const searchResult = await player.search(query, {
        searchEngine: `ext:${SoundCloudExtractor.identifier}`,
        requestedBy: message.author
      });

      console.log(
        "[SEARCH RESULT]",
        searchResult.tracks.length,
        "tracks found"
      );

      if (!searchResult.hasTracks()) {
        return message.reply(
          "❌ No playable SoundCloud tracks found."
        );
      }

      const selectedTrack = searchResult.tracks[0];

      console.log("[SELECTED TRACK]", selectedTrack.title);
      console.log("[TRACK URL]", selectedTrack.url);

      // Play actual search result
      const result = await player.play(
        channel,
        searchResult,
        {
          nodeOptions: {
            ...queueOptions(message.channel)
          }
        }
      );

      console.log("[PLAY REQUEST]", result.track.title);

      return message.reply(
        `🎵 Added to queue: **${result.track.title}**`
      );
    }

    // LEAVE
    if (command === "leave" || command === "disconnect") {
      const queue = getQueue(message.guild.id);

      if (!queue) {
        return message.reply("❌ I am not in a voice channel.");
      }

      if (!sameVoice(message)) {
        return message.reply("❌ Join my voice channel first!");
      }

      queue.delete();

      return message.reply("👋 Left voice channel.");
    }

    // STOP
    if (command === "stop") {
      const queue = getQueue(message.guild.id);

      if (!queue) {
        return message.reply("❌ Nothing is playing.");
      }

      if (!sameVoice(message)) {
        return message.reply("❌ Join my voice channel first!");
      }

      queue.delete();

      return message.reply("⏹️ Playback stopped and queue cleared.");
    }

    // PAUSE
    if (command === "pause") {
      const queue = getQueue(message.guild.id);

      if (!queue?.isPlaying()) {
        return message.reply("❌ Nothing is playing.");
      }

      if (!sameVoice(message)) {
        return message.reply("❌ Join my voice channel first!");
      }

      queue.node.setPaused(true);

      return message.reply("⏸️ Music paused.");
    }

    // RESUME
    if (command === "resume" || command === "unpause") {
      const queue = getQueue(message.guild.id);

      if (!queue || !queue.node.isPaused()) {
        return message.reply("❌ Music is not paused.");
      }

      if (!sameVoice(message)) {
        return message.reply("❌ Join my voice channel first!");
      }

      queue.node.setPaused(false);

      return message.reply("▶️ Music resumed.");
    }

    // SKIP
    if (command === "skip" || command === "s") {
      const queue = getQueue(message.guild.id);

      if (!queue?.isPlaying()) {
        return message.reply("❌ Nothing to skip.");
      }

      if (!sameVoice(message)) {
        return message.reply("❌ Join my voice channel first!");
      }

      queue.node.skip();

      return message.reply("⏭️ Track skipped.");
    }

    // QUEUE
    if (command === "queue" || command === "q") {
      const queue = getQueue(message.guild.id);

      if (!queue?.currentTrack) {
        return message.reply("❌ Queue is empty.");
      }

      const upcoming = queue.tracks.toArray().slice(0, 10);

      const lines = upcoming.map(
        (track, index) => `**${index + 1}.** ${track.title}`
      );

      return message.reply([
        `🎶 **Now Playing:** ${queue.currentTrack.title}`,
        "",
        "**Up Next:**",
        ...(lines.length ? lines : ["No upcoming tracks."])
      ].join("\n"));
    }

    // NOW PLAYING
    if (command === "nowplaying" || command === "np") {
      const queue = getQueue(message.guild.id);

      if (!queue?.currentTrack) {
        return message.reply("❌ Nothing is playing.");
      }

      const track = queue.currentTrack;

      return message.reply(
        `🎶 **${track.title}**\n🔗 ${track.url}\n👤 ${track.author || "Unknown"}`
      );
    }

    // VOLUME
    if (command === "volume" || command === "vol") {
      const queue = getQueue(message.guild.id);

      if (!queue) {
        return message.reply("❌ Music player is not active.");
      }

      if (!sameVoice(message)) {
        return message.reply("❌ Join my voice channel first!");
      }

      const volume = Number(args[0]);

      if (!Number.isInteger(volume) || volume < 1 || volume > 100) {
        return message.reply("❌ Volume must be between 1 and 100.");
      }

      queue.node.setVolume(volume);

      return message.reply(`🔊 Volume set to ${volume}%.`);
    }

  } catch (error) {
    console.error(`[COMMAND ERROR: ${command}]`);
    console.error(error);

    return message.reply(
      `❌ **${command} failed:**\n\`${String(error.message || error).slice(0, 1200)}\``
    ).catch(() => {});
  }
});

// Start
async function start() {
  try {
    await player.extractors.register(SoundCloudExtractor);

    console.log("[extractors] SoundCloud loaded");

    console.log(
      "[dependencies]",
      JSON.stringify(player.scanDeps())
    );

    await client.login(TOKEN);

  } catch (error) {
    console.error("[STARTUP ERROR]", error);
    process.exit(1);
  }
}

process.on("unhandledRejection", (error) => {
  console.error("[UNHANDLED REJECTION]", error);
});

process.on("uncaughtException", (error) => {
  console.error("[UNCAUGHT EXCEPTION]", error);
});

start();
