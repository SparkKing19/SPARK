const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const UserLevel = require('../models/level');
const LevelConfig = require('../models/levelConfig');
const { isFeatureEnabled } = require('../utils/featureCheck');

const BOT_OWNERS = [
    '1549995551288852584',
    '1266728371719508062', // FZBOY
    '1474216218792558735'  // DAREQUEEN
];

// Anti-spam cooldown cache (2 seconds per user)
const cooldowns = new Set();

module.exports = (client) => {

    client.on('messageCreate', async (message) => {
        if (!message.guild || message.author.bot) return;

        const content = message.content.trim();
        const isBotOwner = BOT_OWNERS.includes(message.author.id);
        const isServerOwner = message.author.id === message.guild.ownerId;
        const isAdmin = message.member?.permissions.has(PermissionsBitField.Flags.Administrator);

        // ==========================================
        // 1. COMMAND: %lvl reset (Reset Whole Server)
        // ==========================================
        if (content.toLowerCase() === '%lvl reset') {
            if (!isBotOwner && !isServerOwner && !isAdmin) {
                return message.reply('❌ You do not have permission to reset server levels.');
            }

            try {
                const deleted = await UserLevel.deleteMany({ guildId: message.guild.id });
                return message.reply(`✅ **Server Levels Reset!** Cleared all level and message data for **${deleted.deletedCount}** members.`);
            } catch (err) {
                console.error('Level Reset Error:', err);
                return message.reply(`❌ Failed to reset levels: \`${err.message}\``;
            }
        }

        // ==========================================
        // 2. COMMAND: %lvls lb / %lvl lb (Leaderboard Top 10)
        // ==========================================
        if (content.toLowerCase() === '%lvls lb' || content.toLowerCase() === '%lvl lb') {
            try {
                // Top 10 members sorted by level descending, then totalMessages descending
                const topUsers = await UserLevel.find({ guildId: message.guild.id })
                    .sort({ level: -1, totalMessages: -1 })
                    .limit(10);

                if (!topUsers.length) {
                    return message.reply('ℹ️ Abhi is server me koi leveling data record nahi hua hai.');
                }

                const medals = ['🥇', '🥈', '🥉'];
                const lbRows = [];

                for (let i = 0; i < topUsers.length; i++) {
                    const entry = topUsers[i];
                    const rankBadge = medals[i] || `**#${i + 1}**`;
                    lbRows.push(`${rankBadge} <@${entry.userId}> • **Level ${entry.level}** (${entry.totalMessages} total msgs)`);
                }

                const lbEmbed = new EmbedBuilder()
                    .setColor('#5865F2')
                    .setAuthor({ 
                        name: `${message.guild.name} — Top 10 Level Leaderboard`, 
                        iconURL: message.guild.iconURL({ dynamic: true }) 
                    })
                    .setDescription(lbRows.join('\n'))
                    .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.displayAvatarURL() })
                    .setTimestamp();

                return message.reply({ embeds: [lbEmbed] });
            } catch (err) {
                console.error('Leaderboard Fetch Error:', err);
                return message.reply(`❌ Could not load leaderboard: \`${err.message}\``;
            }
        }

        // ==========================================
        // 3. COMMAND: &rank (Check individual progress)
        // ==========================================
        if (content.toLowerCase().startsWith('&rank')) {
            const targetUser = message.mentions.users.first() || message.author;
            const userData = await UserLevel.findOne({ guildId: message.guild.id, userId: targetUser.id }) || { level: 0, messages: 0, totalMessages: 0 };
            const config = await LevelConfig.findOne({ guildId: message.guild.id }) || { baseStep: 25 };

            const targetMsgs = (userData.level + 1) * config.baseStep;

            const rankEmbed = new EmbedBuilder()
                .setColor('#2B2D31')
                .setAuthor({ name: `${targetUser.username}'s Rank Status`, iconURL: targetUser.displayAvatarURL({ dynamic: true }) })
                .setDescription(
                    `• **Current Level:** \`${userData.level}\`\n` +
                    `• **Progress:** \`${userData.messages} / ${targetMsgs}\` messages\n` +
                    `• **Total Server Messages:** \`${userData.totalMessages}\``
                )
                .setTimestamp();

            return message.reply({ embeds: [rankEmbed] });
        }

        // ==========================================
        // 4. GLOBAL MESSAGE XP ENGINE & DUAL NOTIFICATION
        // ==========================================
        // Check if leveling feature is enabled via %manage
        const featureEnabled = await isFeatureEnabled(message.guild.id, 'leveling', message.author.id);
        if (!featureEnabled) return;

        // Anti-spam cooldown check
        const cooldownKey = `${message.guild.id}_${message.author.id}`;
        if (cooldowns.has(cooldownKey)) return;

        cooldowns.add(cooldownKey);
        setTimeout(() => cooldowns.delete(cooldownKey), 2000);

        // Fetch server leveling config
        const config = await LevelConfig.findOne({ guildId: message.guild.id }) || { 
            baseStep: 25, 
            channelId: null, 
            messageTemplate: 'Congratulations {user}! You leveled up to **Level {level}**!' 
        };

        let userRecord = await UserLevel.findOne({ guildId: message.guild.id, userId: message.author.id });
        if (!userRecord) {
            userRecord = new UserLevel({
                guildId: message.guild.id,
                userId: message.author.id,
                level: 0,
                messages: 1,
                totalMessages: 1
            });
        } else {
            userRecord.messages += 1;
            userRecord.totalMessages += 1;
        }

        // Formula: (Current Level + 1) * BaseStep
        const requiredMsgs = (userRecord.level + 1) * config.baseStep;

        // Check for Level Up
        if (userRecord.messages >= requiredMsgs) {
            userRecord.level += 1;
            userRecord.messages = 0; // Reset progress for the next tier
            await userRecord.save();

            // Format custom alert message (Sirf aapka custom description)
            const template = config.messageTemplate || 'Congratulations {user}! You leveled up to **Level {level}**!';
            const alertText = template
                .replace(/{user}/g, `<@${message.author.id}>`)
                .replace(/{level}/g, userRecord.level);

            // Clean embed WITHOUT ANY TITLE
            const levelEmbed = new EmbedBuilder()
                .setColor('#FEE75C')
                .setAuthor({ 
                    name: `${message.author.username} leveled up!`, 
                    iconURL: message.author.displayAvatarURL({ dynamic: true }) 
                })
                .setDescription(alertText)
                .setTimestamp();

            // 1. Alert in the current chat where the level-up message was typed
            await message.channel.send({ embeds: [levelEmbed] }).catch(() => {});

            // 2. Alert in the designated channel (agar configured ho aur current chat se alag ho)
            if (config.channelId && config.channelId !== message.channel.id) {
                const targetChannel = message.guild.channels.cache.get(config.channelId);
                if (targetChannel && targetChannel.isTextBased()) {
                    await targetChannel.send({ embeds: [levelEmbed] }).catch(() => {});
                }
            }
        } else {
            await userRecord.save();
        }
    });

    console.log('✔ Enhanced Dual-Alert Leveling System with Leaderboard loaded.');
};
