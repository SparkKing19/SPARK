# SPARK / SparkToon SoundCloud Music Bot V1

## Included files
- `index.js` — full SoundCloud music bot source with join, play, pause, resume, skip, stop, queue, nowplaying, volume, leave, and help commands.
- `package.json` — pinned Discord Player / extractor versions plus FFmpeg and Discord DAVE dependency.

## Railway deployment
1. Replace the contents of your bot repository with the contents of this folder (or upload these files into the existing project root).
2. Keep the existing Railway `DISCORD_TOKEN` variable. `PREFIX` is optional and defaults to `+`.
3. Deploy. Railway should run `npm start`.

No CLIENT_ID, GUILD_ID, Lavalink host, or `.env` file is required for this prefix-command version.

## Audio diagnostic change
The Player is initialized with the installed `ffmpeg-static` binary and `skipFFmpeg: false`. This forces the FFmpeg path instead of the raw-stream bypass seen in the previous logs. The next Railway log should show the stream configuration using FFmpeg; verify actual playback in Discord after deployment.
