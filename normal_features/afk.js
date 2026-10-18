const { isNormalFeatureEnabled } = require('../utils/featureCheck');
const afkUsers = new Map();

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        if (!message.guild || message.author.bot) return;
        if (!(await isNormalFeatureEnabled(message.guild.id))) return;

        // 1. Remove AFK on typing
        if (afkUsers.has(message.author.id)) {
            afkUsers.delete(message.author.id);
            const m = await message.reply(`👋 Welcome back <@${message.author.id}>, removed your AFK.`);
            setTimeout(() => m.delete().catch(() => {}), 4000);
        }

        // 2. Set AFK
        if (message.content.toLowerCase().startsWith('!afk')) {
            const reason = message.content.slice(4).trim() || 'AFK';
            afkUsers.set(message.author.id, { reason, time: Date.now() });
            return message.reply(`💤 Set your AFK: **${reason}**`);
        }

        // 3. Mention Detection
        if (message.mentions.users.size > 0) {
            message.mentions.users.forEach((user) => {
                const afkData = afkUsers.get(user.id);
                if (afkData) {
                    message.reply(`💤 **${user.username}** is currently AFK: \`${afkData.reason}\``);
                }
            });
        }
    });
};
