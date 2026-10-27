require('dotenv').config();

const host = process.env.LAVALINK_HOST || 'localhost';
const port = process.env.LAVALINK_PORT || '2333';

// LAVALINK_NODES="wss://host:443|password;ws://host2:2333|password2"  (same format as the Alexa bot)
// Without it, LAVALINK_HOST / PORT / PASSWORD / SECURE (one node) are used.
function parseNodes() {
  const raw = process.env.LAVALINK_NODES;
  const defaultPass = process.env.LAVALINK_PASSWORD || 'youshallnotpass';
  if (!raw) {
    return [{
      name: 'main', url: `${host}:${port}`, auth: defaultPass,
      secure: process.env.LAVALINK_SECURE === 'true'
    }];
  }
  return raw.split(/[;\n]+/).map((s) => s.trim()).filter(Boolean).map((entry, i) => {
    const [endpoint, ...pw] = entry.split('|');
    const m = endpoint.trim().match(/^(?:(wss?|https?):\/\/)?([^/:]+)(?::(\d+))?/i);
    const proto = (m[1] || '').toLowerCase();
    const secure = proto === 'wss' || proto === 'https' || (!proto && m[3] === '443');
    return {
      name: `node-${i + 1}`,
      url: `${m[2]}:${m[3] || (secure ? 443 : 2333)}`,
      auth: pw.length ? pw.join('|') : defaultPass,
      secure
    };
  });
}

module.exports = {
  token: process.env.DISCORD_TOKEN || process.env.TOKEN,
  prefix: process.env.BOT_PREFIX || '+',
  name: process.env.BOT_NAME || 'Music Bot',
  color: parseInt((process.env.COLOR || '#2b2d31').replace('#', ''), 16),
  owners: (process.env.OWNER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean),
  supportUrl: process.env.SUPPORT_URL || '',
  defaultSearch: process.env.DEFAULT_SEARCH || 'ytsearch',
  nodes: parseNodes()
};
