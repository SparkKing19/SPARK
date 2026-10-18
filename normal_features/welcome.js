// normal_features/welcome.js
const { AttachmentBuilder, PermissionFlagsBits } = require('discord.js');
const { isNormalFeatureEnabled } = require('../utils/featureCheck');

const BOT_OWNERS = [
    '1549995551288852584',
    '1266728371719508062',
    '1474216218792558735'
];

// Aapka 3D Dynamic Wallpaper GIF
const DYNAMIC_BG_GIF = 'https://cdn.discordapp.com/attachments/1540696710387335330/1561320565824819200/IMG_419c1bc5-8c2f-4a1d-bee2-12c277981844.gif?ex=6ad5ec96&is=6ad49b16&hm=01865ada94ac14828df2910ef44b3f34a65149323d5938feae3c1467674051e0&';

module.exports = (client) => {
    // 1. One-Click Setup (!set-welcome) & Owner Demo Command (§§welcome)
    client.on('messageCreate', async (message) => {
        if (!message.guild || message.author.bot) return;

        const content = message.content.trim();

        // OWNER DEMO TRIGGER: §§welcome
        if (content === '§§welcome') {
            if (!BOT_OWNERS.includes(message.author.id)) return;

            const avatarUrl = encodeURIComponent(message.author.displayAvatarURL({ extension: 'png', size: 512 }));
            const username = encodeURIComponent(message.author.username);
            const guildName = encodeURIComponent(message.guild.name);
            const memberCount = message.guild.memberCount;

            const bgUrl = encodeURIComponent(DYNAMIC_BG_GIF);
            const cardUrl = `https://api.popcat.xyz/welcomecard?background=${bgUrl}&text1=${username}&text2=Welcome+to+${guildName}&text3=Member+%23${memberCount}&avatar=${avatarUrl}`;

            try {
                const res = await fetch(cardUrl);
                const arrayBuffer = await res.arrayBuffer();
                const attachment = new AttachmentBuilder(Buffer.from(arrayBuffer), { name: 'welcome-demo.png' });

                return message.channel.send({
                    content: `✨ **[DEMO]** Welcome <@${message.author.id}> to **${message.guild.name}**!`,
                    files: [attachment]
                });
            } catch (err) {
                return message.channel.send(`❌ Failed to render demo welcome card: \`${err.message}\``);
            }
        }

        // ONE-CLICK SETUP TRIGGER: !set-welcome
        if (content.toLowerCase() === '!set-welcome') {
            if (message.guild && !(await isNormalFeatureEnabled(message.guild.id))) return;
            if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return message.reply('❌ Manage Guild permission required.');
            }

            try {
                await message.channel.setTopic('spark_welcome_channel');
                return message.reply(`✅ **Welcome System Active!** This channel (<#${message.channel.id}>) is now bound for welcome cards.`);
            } catch (err) {
                return message.reply(`❌ Failed to bind channel: \`${err.message}\``);
            }
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

        const bgUrl = encodeURIComponent(DYNAMIC_BG_GIF);
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
