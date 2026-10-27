const { EmbedBuilder } = require('discord.js');
const config = require('./config');

const pad = (n) => String(n).padStart(2, '0');
const fmt = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
};
const fmtTrack = (t) => (t.isStream ? 'LIVE' : fmt(t.length));

// "90", "1:30", "1m30s" -> ms
const parseTime = (str) => {
  if (!str) return null;
  if (/^\d+$/.test(str)) return +str * 1000;
  if (str.includes(':')) {
    const parts = str.split(':').map(Number);
    if (parts.some(Number.isNaN)) return null;
    return parts.reduce((a, p) => a * 60 + p, 0) * 1000;
  }
  const m = str.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (!m) return null;
  return ((+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0)) * 1000;
};

const embed = (desc, title) => {
  const e = new EmbedBuilder().setColor(config.color).setDescription(String(desc).slice(0, 4096));
  if (title) e.setTitle(title);
  return e;
};
const shorten = (s, n = 60) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const link = (t) => `[${shorten(t.title.replace(/[\[\]]/g, ''))}](${t.uri})`;

const paginate = (arr, page, size = 10) => {
  const pages = Math.max(1, Math.ceil(arr.length / size));
  page = Math.min(Math.max(1, page || 1), pages);
  return { items: arr.slice((page - 1) * size, page * size), page, pages, offset: (page - 1) * size };
};

const bar = (pos, len, size = 18) => {
  if (!len) return '🔴 LIVE';
  const i = Math.round(Math.min(pos / len, 1) * size);
  return '▬'.repeat(i) + '🔘' + '▬'.repeat(size - i);
};

const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Storage form (no requester)
const slim = (t) => ({
  encoded: t.encoded, title: t.title, author: t.author, length: t.length,
  uri: t.uri, identifier: t.identifier, artwork: t.artwork, isStream: t.isStream
});
// Lavalink raw track -> internal track
const toTrack = (raw, requester = null) => ({
  encoded: raw.encoded, title: raw.info.title, author: raw.info.author, length: raw.info.length,
  uri: raw.info.uri, identifier: raw.info.identifier, artwork: raw.info.artworkUrl,
  isStream: raw.info.isStream, requester
});

module.exports = { fmt, fmtTrack, parseTime, embed, shorten, link, paginate, bar, shuffle, slim, toTrack };
