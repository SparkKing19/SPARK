// E('play') -> custom emoji if uploaded (npm run emojis), otherwise a unicode fallback.
const defaults = {
  play: '▶️', pause: '⏸️', stop: '⏹️', skip: '⏭️', previous: '⏮️', shuffle: '🔀', loop: '🔁',
  volume: '🔊', music: '🎵', queue: '📃', like: '❤️', error: '❌', success: '✅',
  search: '🔎', filter: '🎛️', clock: '⏱️'
};
let custom = {};

async function load(client) {
  const all = await client.application.emojis.fetch();
  custom = {};
  for (const e of all.values()) custom[e.name] = e.toString();
}

const E = (name) => custom[name] || defaults[name] || '🎵';
E.load = load;
E.keys = Object.keys(defaults);
module.exports = E;
