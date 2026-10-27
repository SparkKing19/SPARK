// Filter presets (Lavalink v4 filter objects). Each preset replaces all active filters.
const eq = (map) => Object.entries(map).map(([band, gain]) => ({ band: +band, gain }));
const all = (gain) => eq(Object.fromEntries([...Array(15).keys()].map((b) => [b, gain])));

module.exports = {
  bassboost: { equalizer: eq({ 0: 0.35, 1: 0.3, 2: 0.25, 3: 0.15, 4: 0.05 }) },
  softbass: { equalizer: eq({ 0: 0.15, 1: 0.12, 2: 0.08, 3: 0.04 }) },
  treble: { equalizer: eq({ 9: 0.15, 10: 0.2, 11: 0.25, 12: 0.3, 13: 0.3, 14: 0.3 }) },
  pop: { equalizer: eq({ 0: 0.2, 1: 0.1, 2: 0, 3: -0.05, 4: -0.1, 5: 0.05, 6: 0.1, 7: 0.15, 8: 0.2, 9: 0.15 }) },
  soft: { equalizer: eq({ 7: -0.1, 8: -0.15, 9: -0.2, 10: -0.2, 11: -0.25, 12: -0.25, 13: -0.25, 14: -0.25 }) },
  earrape: { equalizer: all(0.4) },
  nightcore: { timescale: { speed: 1.25, pitch: 1.25, rate: 1 } },
  vaporwave: { timescale: { speed: 0.85, pitch: 0.8, rate: 1 } },
  chipmunk: { timescale: { speed: 1.05, pitch: 1.35, rate: 1.25 } },
  '8d': { rotation: { rotationHz: 0.2 } },
  rotation: { rotation: { rotationHz: 0.1 } },
  karaoke: { karaoke: { level: 1, monoLevel: 1, filterBand: 220, filterWidth: 100 } },
  tremolo: { tremolo: { frequency: 4, depth: 0.75 } },
  vibrato: { vibrato: { frequency: 4, depth: 0.75 } },
  lowpass: { lowPass: { smoothing: 20 } }
};
