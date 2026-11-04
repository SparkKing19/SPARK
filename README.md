# SparkToon SoundCloud Music Bot — Railway audio fix

This build keeps the existing 460-line `index.js` commands and uses Railway's **system FFmpeg** instead of the `ffmpeg-static` npm binary.

## Upload
1. Extract this folder.
2. Replace the existing root `index.js` and `package.json` with these files.
3. Add `nixpacks.toml` to the same root folder as `package.json` (important).
4. Commit/push and redeploy on Railway.

Keep your existing Railway `DISCORD_TOKEN`. `PREFIX` is optional and defaults to `+`. No CLIENT_ID, GUILD_ID, Lavalink, or `.env` is required.

## Important Railway builder setting
- If Railway service uses **Railpack** (the current default on many services), add this variable in the SparkToon service Variables: `RAILPACK_DEPLOY_APT_PACKAGES=ffmpeg`.
- If the service uses **Nixpacks**, the included `nixpacks.toml` installs FFmpeg.

Do not keep `ffmpeg-static` in dependencies. After redeploy, the build/runtime must have `ffmpeg` on PATH.

## Test
Run `+play barsaat` in a voice channel. If it still ends early, send the new build log showing FFmpeg installation and the runtime logs from `[ffmpeg]` onward. This package is a targeted fix based on the current logs; actual audio playback must still be verified in Discord.
