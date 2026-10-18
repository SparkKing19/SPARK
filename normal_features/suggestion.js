const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { isNormalFeatureEnabled } = require('../utils/featureCheck');

module.exports = (client) => {
    // 1. One-Click Setup
    client.on('messageCreate', async (message) => {
        if (!message.guild || message.author.bot) return;
        if (message.content.trim().toLowerCase() !== '!set-suggest') return;

        if (message.guild && !(await isNormalFeatureEnabled(message.guild.id))) return;
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply('❌ Manage Channels permission required.');
        }

        await message.channel.setTopic('spark_suggestions_channel');
        return message.reply(`✅ <#${message.channel.id}> is now configured as the **Suggestions Channel**.`);
    });

    // 2. Auto-Convert Suggestions
    client.on('messageCreate', async (message) => {
        if (!message.guild || message.author.bot) return;
        if (!(await isNormalFeatureEnabled(message.guild.id))) return;
        if (!message.channel.topic || !message.channel.topic.includes('spark_suggestions_channel')) return;
        if (message.content.startsWith('!')) return;

        const suggestionText = message.content;
        await message.delete().catch(() => {});

        const embed = new EmbedBuilder()
            .setColor('#F1C40F')
            .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
            .setTitle('💡 New Suggestion')
            .setDescription(suggestionText)
            .setTimestamp();

        const sent = await message.channel.send({ embeds: [embed] });
        await sent.react('👍');
        await sent.react('👎');
    });
};
