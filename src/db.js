// Tiny JSON database (data/db.json). Good enough for a single bot instance.
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'data', 'db.json');
let data = { guilds: {}, users: {}, plays: {} };
try { data = { ...data, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { /* first run */ }

let timer;
function save() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data));
  }, 500);
}

const defaults = {
  prefix: null,
  djRole: null,
  volumeLimit: 150,
  ignored: [],
  musicChannel: null,
  requestChannel: null,
  announce: true,
  autoLeave: true,
  twentyFourSeven: false,
  defaultVolume: 100,
  defaultFilter: null,
  allowedGenres: [],
  maxQueue: 500,
  maxDuration: 0, // minutes, 0 = unlimited
  language: 'en'
};

function guild(id) {
  if (!data.guilds[id]) data.guilds[id] = structuredClone(defaults);
  else for (const k in defaults) if (!(k in data.guilds[id])) data.guilds[id][k] = structuredClone(defaults[k]);
  return data.guilds[id];
}
function resetGuild(id) { data.guilds[id] = structuredClone(defaults); save(); }

function user(id) {
  if (!data.users[id]) data.users[id] = { playlists: {}, liked: [], saved: {} };
  return data.users[id];
}

function addPlay(guildId, track) {
  const p = (data.plays[guildId] ??= { top: {}, recent: [] });
  const t = (p.top[track.uri] ??= { title: track.title, author: track.author, uri: track.uri, count: 0 });
  t.count++;
  p.recent.unshift({ title: track.title, author: track.author, uri: track.uri, at: Date.now() });
  p.recent.length = Math.min(p.recent.length, 25);
  save();
}
function plays(guildId) { return data.plays[guildId] || { top: {}, recent: [] }; }

module.exports = { guild, resetGuild, user, save, addPlay, plays, defaults };
