# SparkTune Music Bot

A Discord slash-command music bot with **Lavalink bundled in the same Docker service**. No external Lavalink host or public node list is required.

## Commands

`/play query` · `/skip` · `/pause` · `/resume` · `/stop` · `/queue` · `/nowplaying` · `/volume level` · `/loop mode` · `/shuffle` · `/ping`

## One-time Discord setup

1. Create an application at https://discord.com/developers/applications.
2. Add a Bot user and copy its token.
3. Under **OAuth2 → URL Generator**, select `bot` and `applications.commands`.
4. Give it View Channels, Send Messages, Embed Links, Connect, and Speak permissions; invite it to your server.
5. Copy the Application ID (Client ID).

The bot token is a secret. Never commit it to GitHub.

## Deploy on Railway

1. Push this folder to a GitHub repository.
2. In Railway, create a project → **Deploy from GitHub repo**.
3. Add these variables in the service:
   - `DISCORD_TOKEN` = your bot token
   - `LAVALINK_PASSWORD` = a strong password (optional, but recommended)
4. Railway detects the `Dockerfile` and builds the bot plus its local Lavalink node. The bot gets its Application ID after login and registers global slash commands automatically.

No public port is required. Keep the service running; music playback stops when the service sleeps/restarts.

## Important

- You only need to provide your Discord bot token. The application ID is obtained from the logged-in bot automatically; no Client ID or Guild ID variable is needed.
- YouTube playback can be affected by upstream YouTube changes, account/login checks, regional restrictions, or provider rate limits. No music bot can guarantee every YouTube URL will always play.
- This project bundles Lavalink 4.2.2 and the Lavalink YouTube source plugin 1.18.2. See the official projects:
  - https://github.com/lavalink-devs/Lavalink
  - https://github.com/lavalink-devs/youtube-source

## Local run

Requires Java 21+, Node.js 22+, and the Lavalink JAR downloaded as `lavalink/Lavalink.jar`.
Copy `.env.example` to `.env`, fill in the two required values, then run `npm install` and start Lavalink using `application.yml`, followed by `npm start`.

## File layout

```text
SparkTune-Music-Bot/
├── src/
│   ├── index.js
│   ├── music.js
│   └── commands.js
├── Dockerfile
├── application.yml
├── start.sh
├── package.json
├── .env.example
├── .gitignore
└── README.md
```