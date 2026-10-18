# SparkCore normal_features modules

This folder intentionally contains separate feature files, like `handlers/`:

- `welcome.js` — image welcome card and `!set-welcome #channel`
- `ticket.js` — `!set-ticket`, `!ticket`, Claim and Close buttons, private `Ticket Support` role, moderator-only action logs; no transcript files/webhooks
- `leveling.js` — 25-message leveling, `!rank`, `!leveling on/off`
- `utility.js` — `!normal-help`, `!botinfo`, `!serverinfo`
- `storage.js` — JSON persistence helper, no MongoDB
- `data/` — JSON data is created here at runtime

## Dependencies

Run `npm install @napi-rs/canvas` in the main project for welcome images. `discord.js` is already required by the main bot.

## Important loading note

Each feature exports `module.exports = client => { ... }`, matching the existing handler convention. However, the uploaded SparkCore `index.js` currently scans only `./handlers/`, not `./normal_features/`. With the strict requirement of not changing `index.js`, these files will not automatically load unless the existing loader already scans `normal_features/`. To activate them without changing `index.js`, the main loader must already support this folder; otherwise that requirement is technically incompatible with the current loader. Do not copy these files into `handlers/` if you want to keep them separate.

Bot permissions for ticket setup: Manage Channels and Manage Roles. Place the bot's highest role above the automatically created `Ticket Support` role. Enable Server Members Intent in the Developer Portal for welcome events. Enable Message Content Intent for `!` prefix commands.
