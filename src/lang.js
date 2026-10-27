const strings = {
  en: {
    ended: 'Queue ended.',
    nowPlaying: 'Now playing',
    nothing: 'Nothing is playing right now.',
    joinVc: 'Join a voice channel first.',
    sameVc: 'You must be in the same voice channel as me.'
  },
  hi: {
    ended: 'Queue khatam ho gayi.',
    nowPlaying: 'Abhi chal raha hai',
    nothing: 'Abhi kuch nahi chal raha.',
    joinVc: 'Pehle kisi voice channel me join karo.',
    sameVc: 'Tumhe mere hi voice channel me hona padega.'
  }
};
module.exports = {
  t: (lang, key) => (strings[lang] || strings.en)[key] || strings.en[key] || key,
  languages: Object.keys(strings)
};
