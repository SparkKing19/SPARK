const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const commandData = [
  new SlashCommandBuilder().setName("play").setDescription("Play a song or playlist").addStringOption(o => o.setName("query").setDescription("Song name or URL").setRequired(true)),
  new SlashCommandBuilder().setName("skip").setDescription("Skip the current song"),
  new SlashCommandBuilder().setName("pause").setDescription("Pause playback"),
  new SlashCommandBuilder().setName("resume").setDescription("Resume playback"),
  new SlashCommandBuilder().setName("stop").setDescription("Stop music and clear queue"),
  new SlashCommandBuilder().setName("queue").setDescription("Show the music queue"),
  new SlashCommandBuilder().setName("nowplaying").setDescription("Show the current song"),
  new SlashCommandBuilder().setName("volume").setDescription("Set volume (1-100)").addIntegerOption(o => o.setName("level").setDescription("Volume percentage").setMinValue(1).setMaxValue(100).setRequired(true)),
  new SlashCommandBuilder().setName("loop").setDescription("Set loop mode").addStringOption(o => o.setName("mode").setDescription("Loop mode").setRequired(true).addChoices(
    { name: "Off", value: "off" }, { name: "Track", value: "track" }, { name: "Queue", value: "queue" }
  )),
  new SlashCommandBuilder().setName("shuffle").setDescription("Shuffle the queue"),
  new SlashCommandBuilder().setName("ping").setDescription("Check bot latency")
];

function embed(title, description) {
  return new EmbedBuilder().setColor(0x5865F2).setTitle(title).setDescription(description);
}
function requireVoice(interaction) {
  if (!interaction.member.voice?.channel) throw new Error("Join a voice channel first.");
}
function sameVoice(interaction) {
  requireVoice(interaction);
  const botChannel = interaction.guild.members.me?.voice?.channelId;
  if (botChannel && botChannel !== interaction.member.voice.channelId) throw new Error("Join my voice channel to use this command.");
}
async function handleCommand(i, music) {
  const id = i.guildId;
  if (i.commandName === "ping") return i.reply({ content: `🏓 ${i.client.ws.ping}ms`, ephemeral: true });
  if (i.commandName === "play") {
    await i.deferReply();
    const result = await music.enqueue(i, i.options.getString("query"));
    return i.editReply({ embeds: [embed("Added to Queue", `**${result.title}**${result.playlist ? `\nPlaylist: ${result.playlist}` : ""}\nAdded ${result.count} track(s).`)] });
  }
  if (i.commandName === "queue") {
    const q = music.queue(id);
    const lines = q.tracks.slice(0, 10).map((t, n) => `**${n + 1}.** ${t.info.title} — ${music.format(t.info.length)}`);
    return i.reply({ embeds: [embed("🎧 Music Queue", `${q.current ? `**Playing:** ${q.current.info.title}\n\n` : ""}${lines.join("\n") || "Queue is empty."}`)], ephemeral: true });
  }
  if (i.commandName === "nowplaying") {
    const q = music.queue(id);
    if (!q.current) throw new Error("Nothing is playing.");
    return i.reply({ embeds: [embed("🎶 Now Playing", `[${q.current.info.title}](${q.current.info.uri || "https://discord.com"})\n**Artist:** ${q.current.info.author || "Unknown"}\n**Duration:** ${music.format(q.current.info.length)}`)] });
  }
  if (i.commandName === "skip") {
    sameVoice(i); await music.skip(id); return i.reply("⏭️ Skipped.");
  }
  if (i.commandName === "pause") {
    sameVoice(i); await music.pause(id, true); return i.reply("⏸️ Paused.");
  }
  if (i.commandName === "resume") {
    sameVoice(i); await music.pause(id, false); return i.reply("▶️ Resumed.");
  }
  if (i.commandName === "stop") {
    sameVoice(i); await music.stop(id); return i.reply("⏹️ Stopped and cleared the queue.");
  }
  if (i.commandName === "volume") {
    sameVoice(i); const level = i.options.getInteger("level"); await music.setVolume(id, level);
    return i.reply(`🔊 Volume set to **${level}%**.`);
  }
  if (i.commandName === "loop") {
    sameVoice(i); const q = music.queue(id); q.loop = i.options.getString("mode");
    return i.reply(`🔁 Loop mode: **${q.loop}**.`);
  }
  if (i.commandName === "shuffle") {
    sameVoice(i); const q = music.queue(id);
    for (let n = q.tracks.length - 1; n > 0; n--) {
      const j = Math.floor(Math.random() * (n + 1));
      [q.tracks[n], q.tracks[j]] = [q.tracks[j], q.tracks[n]];
    }
    return i.reply(`🔀 Shuffled **${q.tracks.length}** queued tracks.`);
  }
}

module.exports = { commandData, handleCommand };