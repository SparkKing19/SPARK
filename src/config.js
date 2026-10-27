
require('dotenv').config();

const host = process.env.LAVALINK_HOST || 'localhost';
const port = process.env.LAVALINK_PORT || '2333';

function parseNodes() {
  const defaultPass =
    process.env.LAVALINK_PASSWORD ||
    process.env.LAVALINK_SERVER_PASSWORD ||
    'youshallnotpass';

  const raw = process.env.LAVALINK_NODES;

  if (!raw) {
    return [{
      name: 'main',
      url: `${host}:${port}`,
      auth: defaultPass,
      secure: process.env.LAVALINK_SECURE === 'true'
    }];
  }

  return raw
    .split(/[;\n]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .map((entry, i) => {
      const [endpoint, ...passwordParts] = entry.split('|');

      const match = endpoint.trim().match(
        /^(?:(wss?|https?):\/\/)?([^/:]+)(?::(\d+))?$/i
      );

      if (!match) {
        throw new Error(`Invalid Lavalink node: ${endpoint}`);
      }

      const protocol = (match[1] || '').toLowerCase();
      const secure =
        protocol === 'wss' ||
        protocol === 'https' ||
        (!protocol && match[3] === '443');

      return {
        name: `node-${i + 1}`,
        url: `${match[2]}:${match[3] || (secure ? 443 : '2333')}`,
        auth: passwordParts.length
          ? passwordParts.join('|')
          : defaultPass,
        secure
      };
    });
}

module.exports = {
  token: process.env.DISCORD_TOKEN || process.env.TOKEN,
  prefix: process.env.BOT_PREFIX || '+',
  name: process.env.BOT_NAME || 'Music Bot',
  color: parseInt(
    (process.env.COLOR || '#2b2d31').replace('#', ''),
    16
  ),
  owners: (process.env.OWNER_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
  supportUrl: process.env.SUPPORT_URL || '',
  defaultSearch: process.env.DEFAULT_SEARCH || 'ytsearch',
  nodes: parseNodes()
};
