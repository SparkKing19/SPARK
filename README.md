# Music Bot — 102 commands (music only)

Discord music bot: **discord.js v14 + Shoukaku v4 + Lavalink v4**. Prefix commands (default `+`, set `BOT_PREFIX` in .env).
Slash commands are not used because Discord allows max 100 global slash commands.

## Setup
1. **Discord Developer Portal** → New Application → Bot → copy the token.
   Bot tab → enable **Message Content Intent**.
2. Copy `.env.example` to `.env` and fill `DISCORD_TOKEN` (Railway variable; `TOKEN` is also supported) (and `OWNER_IDS`, `SUPPORT_URL` if you want).
3. **Lavalink** (needs Java 17+): download `Lavalink.jar` from
   https://github.com/lavalink-devs/Lavalink/releases, put it next to `lavalink/application.yml`
   and run `java -jar Lavalink.jar`. Or use Docker: `docker compose up -d lavalink`.
   (If you use a public/hosted Lavalink node instead, just set `LAVALINK_HOST/PORT/PASSWORD/SECURE` in `.env`.)
4. `npm install`
5. `npm run emojis`  *(optional)* — uploads the custom emojis in `/emojis` to your bot.
6. `npm start`
7. Invite with `+invite` (or build the link yourself with scope `bot`).

## Custom emojis
`/emojis` has 16 ready icons (play, pause, stop, skip, previous, shuffle, loop, volume,
music, queue, like, error, success, search, filter, clock). `npm run emojis` uploads them
as **application emojis**, so they work in every server — no emoji slots used.
Want your own? Replace any PNG/GIF in `/emojis` with the same file name (or add new ones),
run `npm run emojis` again and restart. Without upload the bot uses normal unicode emojis.

## Project layout
```
src/index.js              bot start, loads commands/events
src/commands/*.js         each file exports an array of commands (add yours easily)
src/music/Player.js       queue, loop, autoplay, filters per server
src/music/manager.js      search + join + add-to-queue logic
src/db.js                 JSON storage (data/db.json): settings, playlists, likes
```
A command looks like:
```js
{ name: 'ping', aliases: [], category: 'Info', description: '...',
  voice: true,   // user must be in a voice channel
  player: true,  // a player must exist
  track: true,   // something must be playing
  create: true,  // join VC & create player if missing
  dj: true,      // needs DJ role (if one is set)
  admin: true,   // needs Manage Server
  async run(ctx) { ctx.say('hello'); } }
```

## Commands (102)
**Playback (15)** play, playnow, playnext, search, pause, resume, stop, skip, previous, seek, forward, rewind, replay, forceskip, voteskip
**Queue (20)** queue, nowplaying, remove, removedupes, clear, shuffle, move, skipto, jump, loop, loopqueue, loopsong, autoplay, savequeue, loadqueue, reverse, swap, queuelength, history, undo
**Filters (20)** volume, bassboost, nightcore, vaporwave, 8d, karaoke, treble, speed, pitch, tremolo, vibrato, rotation, lowpass, softbass, pop, soft, chipmunk, earrape, equalizer, resetfilters
**Playlists (15)** playlist-create, playlist-add, playlist-remove, playlist-play, playlist-list, playlist-delete, playlist-rename, playlist-view, playlist-shuffle, playlist-import, playlist-share, like, unlike, liked, playliked
**Info (12)** lyrics, ping, stats, help, invite, support, uptime, about, trackinfo, artistinfo, topsongs, recent
**Settings (20)** setprefix, 247, join, leave, djrole, volumelimit, ignorechannel, reset, musicchannel, requestchannel, announce, autoleave, vcmute, defaultvolume, defaultfilter, settings, allowedgenres, maxqueue, maxduration, language

Many commands have short aliases (`p`, `s`, `q`, `np`, `vol`, `bb` ...). `+help <command>` shows them.

## Hosted Lavalink nodes & sources
Set `LAVALINK_NODES="wss://host:443|password;ws://host2:2333|password2"` in `.env` to use one or more hosted nodes
(the bot picks the least loaded one). Then no local Lavalink is needed.
Pick a source per search with a prefix: `+play sp: song` (Spotify), `ytm:` (YouTube Music), `yt:` (YouTube),
`sc:` (SoundCloud), `am:` (Apple Music), `dz:` (Deezer). Spotify / Apple / Deezer need LavaSrc on the node.

## Notes
- **Spotify links** need the LavaSrc plugin on Lavalink (not included). YouTube, SoundCloud, Bandcamp, Twitch, Vimeo and direct links work out of the box.
- YouTube sometimes blocks server IPs; if search fails, update the youtube-source plugin version in `application.yml` (see its README for OAuth / poToken options).
- `allowedgenres` is keyword-based (matches words in title/artist), `vcmute` mutes the music (volume 0) and keeps the queue.
- Data is stored in `data/db.json` — back it up if you host on a disposable filesystem.
