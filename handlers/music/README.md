# Professional Music Handler (discord.js v14 + Shoukaku v4)

This is a modular **prefix-command music handler** designed for a Discord bot. It includes a queue manager, Lavalink/Shoukaku integration, controls, and command files.

## Commands
- `%play <song name or URL>` — search and play / add to queue
- `%join` — join your current voice channel
- `%leave` — disconnect and clear queue
- `%pause`, `%resume`, `%skip`, `%stop`
- `%queue [page]`, `%nowplaying`
- `%volume <0-100>`, `%loop off|track|queue`
- `%shuffle`, `%remove <queue-position>`, `%clear`
- `%seek <seconds>`

## Requirements
- Node.js 22+
- `discord.js` v14
- `shoukaku` v4
- A working Lavalink v4 server with a compatible source plugin.
- Bot needs `Connect` and `Speak` in voice channels.

Install dependencies (if not already installed):
```bash
npm install discord.js shoukaku
```

## Integration
1. Copy this `music/` folder into your project at `handlers/music/`.
2. Create a Shoukaku client once in your main bot file and assign it to `client.shoukaku`. See `integration.example.js`.
3. In your existing message/prefix command handler, load each `.js` file in `commands/` and call its `execute(message, args, client, musicManager)` function. See `loader.example.js`.
4. Set `LAVALINK_HOST`, `LAVALINK_PORT`, `LAVALINK_PASSWORD`, and `LAVALINK_SECURE` in your environment. Never commit secrets.
5. Check your Lavalink server's source plugins. Search syntax varies by installed plugin; this pack defaults to `ytsearch:` and falls back to `scsearch:`.

## Important compatibility note
Shoukaku's APIs and Lavalink source availability depend on the installed versions/configuration. This is a clean modular starter, but it must be integrated into your current bot entry point and tested against your Lavalink node. It is not a pre-deployed bot, and it does not include a Lavalink server.

## Suggested folder structure
```text
handlers/
  music/
    commands/
    lib/
    index.js
    integration.example.js
    loader.example.js
```
