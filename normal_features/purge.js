const { PermissionFlagsBits } = require('discord.js');
const { isNormalFeatureEnabled } = require('../utils/featureCheck');

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        if (!message.guild || message.author.bot) return;

        const args = message.content.trim().split(/ +/);
        const cmd = args[0]?.toLowerCase();
        if (cmd !== '!purge' && cmd !== '!clear') return;

        if (message.guild && !(await isNormalFeatureEnabled(message.guild.id))) return;
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return message.reply('❌ Manage Messages permission required.');
        }

        const amount = parseInt(args[1], 10);
        if (isNaN(amount) || amount < 1 || amount > 100) {
            return message.reply('❌ Enter a number between 1 and 100 (`!purge 20`).');
        }

        await message.delete().catch(() => {});
        const fetched = await message.channel.messages.fetch({ limit: amount });
        await message.channel.bulkDelete(fetched, true).catch(() => {});

        const confirm = await message.channel.send(`🧹 Cleaned **${fetched.size}** messages.`);
        setTimeout(() => confirm.delete().catch(() => {}), 4000);
    });
};
