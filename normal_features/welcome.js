// normal_features/welcome.js

const { AttachmentBuilder, PermissionFlagsBits } = require('discord.js');
const { isNormalFeatureEnabled } = require('../utils/featureCheck');

module.exports = (client) => {
    // 1. One-Click Setup
    client.on('messageCreate', async (message) => {
        if (!message.guild || message.author.bot) return;
        if (message.content.trim().toLowerCase() !== '!set-welcome') return;

        if (message.guild && !(await isNormalFeatureEnabled(message.guild.id))) return;
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return message.reply('❌ Manage Guild permission required.');
        }

        try {
            await message.channel.setTopic('spark_welcome_channel');
            return message.reply(`✅ **Welcome System Active!** This channel (<#${message.channel.id}>) is now the official welcome channel.`);
        } catch (err) {
            return message.reply(`❌ Failed to bind channel: \`${err.message}\``);
        }
    });

    // 2. Member Join Card Dispatcher
    client.on('guildMemberAdd', async (member) => {
        if (member.guild && !(await isNormalFeatureEnabled(member.guild.id))) return;

        const welcomeChannel = member.guild.channels.cache.find(c => 
            c.isTextBased() && c.topic && c.topic.includes('spark_welcome_channel')
        );
        if (!welcomeChannel) return;

        const avatarUrl = encodeURIComponent(member.user.displayAvatarURL({ extension: 'png', size: 512 }));
        const username = encodeURIComponent(member.user.username);
        const guildName = encodeURIComponent(member.guild.name);
        const memberCount = member.guild.memberCount;

        // Dark clean aesthetic background (Unsplash high-uptime direct CDN)
        const bgUrl = encodeURIComponent('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1000&q=80');
        const cardUrl = `https://api.popcat.xyz/welcomecard?background=${bgUrl}&text1=${username}&text2=Welcome+to+${guildName}&text3=Member+%23${memberCount}&avatar=${avatarUrl}`;

        try {
            const res = await fetch(cardUrl);
            const arrayBuffer = await res.arrayBuffer();
            const attachment = new AttachmentBuilder(Buffer.from(arrayBuffer), { name: 'welcome.png' });

            await welcomeChannel.send({
                content: `Welcome <@${member.id}> to **${member.guild.name}**!`,
                files: [attachment]
            });
        } catch (_) {
            await welcomeChannel.send({
                content: `Welcome <@${member.id}> to **${member.guild.name}**! (Member #${memberCount})`
            });
        }
    });
};
