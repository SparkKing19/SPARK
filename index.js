const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { Player } = require("discord-player");
const { SoundCloudExtractor } = require("@discord-player/extractor");

const TOKEN = process.env.DISCORD_TOKEN;
const PREFIX = process.env.PREFIX || "+";

if (!TOKEN) {
  console.error("[config] DISCORD_TOKEN is missing. Add it in Railway Variables.");
  process.exit(1);
}

// Use the npm-provided FFmpeg binary when available.
try {
  const ffmpegPath = require("ffmpeg-static");
  if (ffmpegPath) process.env.FFMPEG_PATH = ffmpegPath;
} catch (_) {}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Channel]
});

const player = new Player(client);

const helpText = [
  `**🎧 SoundCloud Music Bot — V1**`,
  `\`${PREFIX}join\` — Join your voice channel`,
  `\`${PREFIX}play <song/link>\` — Play SoundCloud music`,
  `\`${PREFIX}pause\` — Pause playback`,
  `\`${PREFIX}resume\` — Resume playback`,
  `\`${PREFIX}skip\` — Skip current track`,
  `\`${PREFIX}stop\` — Stop and clear queue`,
  `\`${PREFIX}queue\` — Show the queue`,
  `\`${PREFIX}nowplaying\` — Current track`,
  `\`${PREFIX}volume <1-100>\` — Set volume`,
  `\`${PREFIX}leave\` — Leave voice channel`,
  `\`${PREFIX}help\` — Show commands`,
  "",
  "Only SoundCloud tracks and SoundCloud links are supported in V1."
].join("\n");

function getQueue(guildId) {
  return player.nodes.get(guildId);
}

function voiceChannelOf(message) {
  return message.member?.voice?.channel;
}

function botVoiceChannel(message) {
  return message.guild?.members?.me?.voice?.channel;
}

function sameVoiceChannel(message) {
  const userChannel = voiceChannelOf(message);
  const botChannel = botVoiceChannel(message);
  return !botChannel || (userChannel && botChannel.id === userChannel.id);
}

async function ensureVoicePermissions(message, channel) {
  const permissions = channel.permissionsFor(message.guild.members.me);
  if (!permissions?.has("Connect")) {
    await message.reply("❌ Mujhe is voice channel mein **Connect** permission nahi hai.");
    return false;
  }
  if (!permissions?.has("Speak")) {
    await message.reply("❌ Mujhe is voice channel mein **Speak** permission nahi hai.");
    return false;
  }
  return true;
}

client.once("ready", () => {
  console.log(`[ready] Logged in as ${client.user.tag}`);
  console.log(`[ready] Prefix: ${PREFIX}`);
  console.log("[ready] V1 source: SoundCloud only");
});

player.events.on("playerStart", (queue, track) => {
  queue.metadata?.send(`🎶 **Now playing:** [${track.title}](${track.url})`).catch(() => {});
});
player.events.on("audioTrackAdd", (queue, track) => {
  queue.metadata?.send(`➕ Added to queue: **${track.title}**`).catch(() => {});
});
player.events.on("audioTracksAdd", (queue, tracks) => {
  queue.metadata?.send(`➕ Added **${tracks.length} tracks** to the queue.`).catch(() => {});
});
player.events.on("emptyQueue", (queue) => {
  queue.metadata?.send("✅ Queue finished.").catch(() => {});
});
player.events.on("playerError", (queue, error, track) => {
  console.error("[playerError]", track?.title || "unknown track", error);
  queue.metadata?.send(`⚠️ Playback error${track ? ` for **${track.title}**` : ""}. Try another SoundCloud track.`).catch(() => {});
});
player.events.on("error", (queue, error) => {
  console.error("[queueError]", error);
  queue.metadata?.send("⚠️ Music player error. Please try again.").catch(() => {});
});

client.on("messageCreate", async (message) => {
  if (!message.guild || message.author.bot || !message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = (args.shift() || "").toLowerCase();
  if (!command) return;

  try {
    if (command === "help" || command === "commands") {
      return message.reply(helpText);
    }

    if (command === "join") {
      const channel = voiceChannelOf(message);
      if (!channel) return message.reply("❌ Pehle kisi voice channel mein join karo.");
      if (!(await ensureVoicePermissions(message, channel))) return;

      const queue = getQueue(message.guild.id) || player.nodes.create(message.guild, {
        metadata: message.channel,
        selfDeaf: true,
        volume: 70,
        leaveOnEmpty: true,
        leaveOnEmptyCooldown: 60_000,
        leaveOnEnd: false,
        leaveOnStop: false
      });

      await queue.connect(channel);
      return message.reply(`✅ Joined **${channel.name}**.`);
    }

    if (command === "play" || command === "p") {
      const query = args.join(" ").trim();
      if (!query) return message.reply(`❌ Song name ya SoundCloud link do. Example: \`${PREFIX}play Alan Walker Faded\``);

      const channel = voiceChannelOf(message);
      if (!channel) return message.reply("❌ Pehle voice channel mein join karo.");
      if (!sameVoiceChannel(message)) return message.reply("❌ Main already kisi aur voice channel mein hoon.");
      if (!(await ensureVoicePermissions(message, channel))) return;

      await message.channel.sendTyping();
      const queue = getQueue(message.guild.id) || player.nodes.create(message.guild, {
        metadata: message.channel,
        selfDeaf: true,
        volume: 70,
        leaveOnEmpty: true,
        leaveOnEmptyCooldown: 60_000,
        leaveOnEnd: false,
        leaveOnStop: false
      });

      // Force SoundCloud extractor: no YouTube/Spotify fallback in V1.
      const soundcloudQuery = /^https?:\/\/(www\.)?soundcloud\.com\//i.test(query)
        ? query
        : `scsearch:${query}`;

      const result = await player.play(channel, soundcloudQuery, {
        nodeOptions: {
          metadata: message.channel,
          selfDeaf: true,
          volume: 70,
          leaveOnEmpty: true,
          leaveOnEmptyCooldown: 60_000,
          leaveOnEnd: false,
          leaveOnStop: false,
          skipOnNoStream: true
        },
        searchEngine: `ext:${SoundCloudExtractor.identifier}`
      });

      return message.reply(`🔎 SoundCloud se **${result.track.title}** queue mein add kar diya.`);
    }

    if (command === "leave" || command === "disconnect") {
      const queue = getQueue(message.guild.id);
      if (!queue) return message.reply("❌ Main kisi voice channel mein nahi hoon.");
      if (!sameVoiceChannel(message)) return message.reply("❌ Pehle mere voice channel mein aao.");
      queue.delete();
      return message.reply("👋 Voice channel leave kar diya.");
    }

    if (command === "stop") {
      const queue = getQueue(message.guild.id);
      if (!queue) return message.reply("❌ Abhi kuch play nahi ho raha.");
      if (!sameVoiceChannel(message)) return message.reply("❌ Pehle mere voice channel mein aao.");
      queue.delete();
      return message.reply("⏹️ Playback stop kar diya aur queue clear kar di.");
    }

    if (command === "pause") {
      const queue = getQueue(message.guild.id);
      if (!queue?.isPlaying()) return message.reply("❌ Abhi koi track play nahi ho raha.");
      if (!sameVoiceChannel(message)) return message.reply("❌ Pehle mere voice channel mein aao.");
      queue.node.setPaused(true);
      return message.reply("⏸️ Music paused.");
    }

    if (command === "resume" || command === "unpause") {
      const queue = getQueue(message.guild.id);
      if (!queue || !queue.node.isPaused()) return message.reply("❌ Music paused nahi hai.");
      if (!sameVoiceChannel(message)) return message.reply("❌ Pehle mere voice channel mein aao.");
      queue.node.setPaused(false);
      return message.reply("▶️ Music resumed.");
    }

    if (command === "skip" || command === "s") {
      const queue = getQueue(message.guild.id);
      if (!queue?.isPlaying()) return message.reply("❌ Skip karne ke liye koi track nahi hai.");
      if (!sameVoiceChannel(message)) return message.reply("❌ Pehle mere voice channel mein aao.");
      queue.node.skip();
      return message.reply("⏭️ Track skipped.");
    }

    if (command === "queue" || command === "q") {
      const queue = getQueue(message.guild.id);
      if (!queue?.currentTrack) return message.reply("❌ Queue empty hai.");
      const upcoming = queue.tracks.toArray().slice(0, 10);
      const lines = upcoming.map((track, index) => `**${index + 1}.** ${track.title}`);
      const current = `🎶 **Now:** ${queue.currentTrack.title}`;
      return message.reply([current, "", "**Up next:**", ...(lines.length ? lines : ["No upcoming tracks."])].join("\n"));
    }

    if (command === "nowplaying" || command === "np") {
      const queue = getQueue(message.guild.id);
      if (!queue?.currentTrack) return message.reply("❌ Abhi koi track play nahi ho raha.");
      const track = queue.currentTrack;
      return message.reply(`🎶 **${track.title}**\n🔗 ${track.url}\n👤 ${track.author || "Unknown artist"}`);
    }

    if (command === "volume" || command === "vol") {
      const queue = getQueue(message.guild.id);
      if (!queue) return message.reply("❌ Abhi music player active nahi hai.");
      if (!sameVoiceChannel(message)) return message.reply("❌ Pehle mere voice channel mein aao.");
      const volume = Number(args[0]);
      if (!Number.isInteger(volume) || volume < 1 || volume > 100) {
        return message.reply(`❌ Volume 1 se 100 ke beech do. Example: \`${PREFIX}volume 70\``);
      }
      queue.node.setVolume(volume);
      return message.reply(`🔊 Volume **${volume}%** set kar diya.`);
    }
  } catch (error) {
    console.error(`[command:${command}]`, error);
    return message.reply("❌ Command run nahi ho payi. SoundCloud link/track check karo aur dobara try karo.").catch(() => {});
  }
});

async function start() {
  try {
    await player.extractors.register(SoundCloudExtractor);
    console.log("[extractors] SoundCloud extractor loaded");
    await client.login(TOKEN);
  } catch (error) {
    console.error("[startup] Failed to start bot:", error);
    process.exit(1);
  }
}

process.on("unhandledRejection", (error) => console.error("[unhandledRejection]", error));
process.on("uncaughtException", (error) => {
  console.error("[uncaughtException]", error);
});

start();
