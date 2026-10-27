const db = require('../db');
const store = require('../music/store');

module.exports = async (client, oldState, newState) => {
  const gp = store.get(newState.guild.id);
  if (!gp) return;

  if (newState.id === client.user.id) {
    if (!newState.channelId) return gp.destroy(false); // kicked / disconnected manually
    gp.voiceChannelId = newState.channelId;
  }

  const g = db.guild(newState.guild.id);
  const ch = newState.guild.channels.cache.get(gp.voiceChannelId);
  const humans = ch ? ch.members.filter((m) => !m.user.bot).size : 0;

  clearTimeout(gp.emptyTimer);
  if (humans === 0 && g.autoLeave && !g.twentyFourSeven) {
    gp.emptyTimer = setTimeout(() => {
      const c = newState.guild.channels.cache.get(gp.voiceChannelId);
      if (!c || c.members.filter((m) => !m.user.bot).size === 0) {
        gp.say('Left the voice channel because it was empty.');
        gp.destroy();
      }
    }, 60000);
  }
};
