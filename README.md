# SoundCloud Music Bot — V1

A simple Discord music bot using Discord.js + Discord Player. **V1 supports SoundCloud only.** No Lavalink server, Client ID, or Guild ID is required.

## 1. Railway setup

Your Railway service should be connected to this GitHub repository.

Add this variable in Railway → Service → Variables:

```env
DISCORD_TOKEN=YOUR_BOT_TOKEN
```

Optional:

```env
PREFIX=+
```

Railway will run `npm start` automatically using the `start` script in `package.json`.

## 2. Discord Developer Portal

In your application → Bot:
- Enable **Message Content Intent** under Privileged Gateway Intents.
- Make sure the bot has permission to View Channels, Send Messages, Connect, and Speak.
- Invite it to your server with the `bot` scope and the permissions above.

## 3. Commands

| Command | What it does |
|---|---|
| `+join` | Join your current voice channel |
| `+play <song/link>` | Search/play SoundCloud |
| `+pause` | Pause |
| `+resume` | Resume |
| `+skip` | Skip current track |
| `+stop` | Stop and clear queue |
| `+queue` | Show upcoming tracks |
| `+nowplaying` | Show current track |
| `+volume 70` | Set volume from 1–100 |
| `+leave` | Leave voice channel |
| `+help` | Show help |

Examples:

```text
+join
+play Alan Walker Faded
+play https://soundcloud.com/artist/track
+volume 70
```

## Notes

- Do not upload your Discord token to GitHub.
- SoundCloud may restrict some tracks, regions, or copyrighted uploads. Those tracks may fail to play.
- This version intentionally forces SoundCloud search and does not use YouTube or Spotify.
