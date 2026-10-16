const { 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder, 
    PermissionsBitField,
    AttachmentBuilder 
} = require('discord.js');
const LevelingConfig = require('../models/leveling');
const { parseVariables } = require('../utils/variables');
const { isFeatureEnabled } = require('../utils/featureCheck');

const BOT_OWNERS = [
    '1549995551288852584',
    '1266728371719508062', // FZBOY
    '1474216218792558735'  // DAREQUEEN
];

// Helper: Bina Embed ke Avatar ke sath direct message bhejna
async function sendNonEmbedNotification(channel, user, contentText) {
    try {
        // Tareeqa 1: Webhook use karke user avatar aur direct text
        if (channel.guild.members.me?.permissionsIn(channel).has(PermissionsBitField.Flags.ManageWebhooks)) {
            const webhooks = await channel.fetchWebhooks().catch(() => null);
            let hook = webhooks?.find(w => w.name === 'SparkCore Level Alerts');
            
            if (!hook) {
                hook = await channel.createWebhook({
                    name: 'SparkCore Level Alerts',
                    avatar: channel.client.user.displayAvatarURL()
                }).catch(() => null);
            }

            if (hook) {
                await hook.send({
                    content: contentText,
                    username: user.username,
                    avatarURL: user.displayAvatarURL({ dynamic: true })
                });
                return;
            }
        }
    } catch (_) {}

    // Tareeqa 2: Fallback agar webhook permission na ho (Direct text + Avatar attachment)
    const avatarAttach = new AttachmentBuilder(user.displayAvatarURL({ extension: 'png', size: 128 }), { name: 'avatar.png' });
    await channel.send({
        content: contentText,
        files: [avatarAttach]
    }).catch(() => {});
}

module.exports = (client) => {

    // 1. Setup Modal Trigger via /panel
    client.on('interactionCreate', async (interaction) => {
        if (interaction.isButton() && interaction.customId === 'open_leveling_modal') {
            const data = await LevelingConfig.findOne({ guildId: interaction.guild.id }) || {};

            const modal = new ModalBuilder()
                .setCustomId('leveling_config_modal')
                .setTitle('Leveling System Configuration');

            const stepInput = new TextInputBuilder()
                .setCustomId('lvl_messages_step')
                .setLabel('Messages Per Level (Base Step)')
                .setPlaceholder('e.g. 25 (Lvl 1: 25, Lvl 2: 50, Lvl 3: 75)')
                .setStyle(TextInputStyle.Short)
                .setValue(data.messagesPerLevel ? `${data.messagesPerLevel}` : '25')
                .setRequired(true);

            const channelInput = new TextInputBuilder()
                .setCustomId('lvl_channel_id')
                .setLabel('Level Notification Channel ID (Optional)')
                .setPlaceholder('Leave blank to notify in the current chat')
                .setStyle(TextInputStyle.Short)
                .setValue(data.channelId || '')
                .setRequired(false);

            const msgInput = new TextInputBuilder()
                .setCustomId('lvl_message')
                .setLabel('Level Up Message')
                .setPlaceholder('Congratulations {user}! You reached Level {level}!')
                .setStyle(TextInputStyle.Paragraph)
                .setValue(data.levelUpMessage || 'Congratulations {user}! You leveled up to **Level {level}**!')
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(stepInput),
                new ActionRowBuilder().addComponents(channelInput),
                new ActionRowBuilder().addComponents(msgInput)
            );

            return await interaction.showModal(modal);
        }

        // 2. Save Modal Configuration
        if (interaction.isModalSubmit() && interaction.customId === 'leveling_config_modal') {
            await interaction.deferReply({ flags: 64 });

            const rawStep = interaction.fields.getTextInputValue('lvl_messages_step').trim();
            const channelId = interaction.fields.getTextInputValue('lvl_channel_id').trim() || null;
            const levelUpMessage = interaction.fields.getTextInputValue('lvl_message').trim();

            const messagesPerLevel = Math.max(1, parseInt(rawStep, 10) || 25);

            await LevelingConfig.findOneAndUpdate(
                { guildId: interaction.guild.id },
                { messagesPerLevel, channelId, levelUpMessage },
                { upsert: true, new: true }
            );

            return interaction.editReply({ 
                content: `✅ Leveling system configured!\n• **Step:** \`${messagesPerLevel}\` msgs/level\n• **Log Channel:** ${channelId ? `<#${channelId}>` : '`Current Chat`'}`
            });
        }
    });

    // 3. Message Counter & Dual Notifications
    client.on('messageCreate', async (message) => {
        if (!message.guild || message.author.bot) return;

        const content = message.content.trim();
        const isBotOwner = BOT_OWNERS.includes(message.author.id);
        const isServerOwner = message.author.id === message.guild.ownerId;
        const isAdmin = message.member?.permissions.has(PermissionsBitField.Flags.Administrator);

        // A. COMMAND: %lvl reset
        if (content.toLowerCase() === '%lvl reset') {
            if (!isBotOwner && !isServerOwner && !isAdmin) {
                return message.reply('❌ You do not have permission to reset server levels.');
            }

            const data = await LevelingConfig.findOne({ guildId: message.guild.id });
            if (!data || !data.users || data.users.length === 0) {
                return message.reply('ℹ️ Abhi is server me koi level data record nahi hai.');
            }

            const clearedCount = data.users.length;
            data.users = [];
            await data.save();

            return message.reply(`✅ **Server Levels Reset!** Cleared all level and message data for **${clearedCount}** members.`);
        }

        // B. COMMAND: %lvls lb / %lvl lb
        if (content.toLowerCase() === '%lvls lb' || content.toLowerCase() === '%lvl lb') {
            const data = await LevelingConfig.findOne({ guildId: message.guild.id });
            if (!data || !data.users || data.users.length === 0) {
                return message.reply('ℹ️ Abhi is server me koi leveling data record nahi hua hai.');
            }

            const topUsers = [...data.users]
                .sort((a, b) => b.level - a.level || b.messages - a.messages)
                .slice(0, 10);

            const medals = ['🥇', '🥈', '🥉'];
            const lbRows = [];

            for (let i = 0; i < topUsers.length; i++) {
                const entry = topUsers[i];
                const rankBadge = medals[i] || `**#${i + 1}**`;
                lbRows.push(`${rankBadge} <@${entry.userId}> • **Level ${entry.level}** (${entry.messages} msgs)`);
            }

            return message.reply({
                content: `🏆 **${message.guild.name} — Top 10 Level Leaderboard**\n\n${lbRows.join('\n')}`
            });
        }

        // C. COMMAND: &rank
        if (content.toLowerCase().startsWith('&rank')) {
            const target = message.mentions.users.first() || message.author;
            const data = await LevelingConfig.findOne({ guildId: message.guild.id });

            if (!data) return message.reply('⚠️ Leveling is not configured for this server yet.');

            const userRecord = data.users.find(u => u.userId === target.id) || { level: 0, messages: 0 };
            const requiredForNext = (userRecord.level + 1) * data.messagesPerLevel;

            return message.reply({
                content: `📊 **${target.username}'s Rank Status**\n• **Level:** \`${userRecord.level}\`\n• **Progress:** \`${userRecord.messages} / ${requiredForNext}\` msgs\n• **Multiplier:** \`+${data.messagesPerLevel} msgs/lvl\``
            });
        }

        // D. Instant XP Tracker (No cooldown)
        const enabled = await isFeatureEnabled(message.guild.id, 'leveling', message.author.id);
        if (!enabled) return;

        let data = await LevelingConfig.findOne({ guildId: message.guild.id });
        if (!data) return;

        let userRecord = data.users.find(u => u.userId === message.author.id);
        if (!userRecord) {
            userRecord = { userId: message.author.id, messages: 0, level: 0 };
            data.users.push(userRecord);
        }

        userRecord.messages += 1;

        const nextLevel = userRecord.level + 1;
        const requiredForNext = nextLevel * data.messagesPerLevel;

        if (userRecord.messages >= requiredForNext) {
            userRecord.level = nextLevel;
            userRecord.messages = 0;

            let formattedMsg = parseVariables(data.levelUpMessage, {
                member: message.member,
                user: message.author,
                guild: message.guild
            });
            formattedMsg = formattedMsg.replace(/{level}/g, `${userRecord.level}`);

            // 1. Current Chat Alert (Direct Plain Message with Avatar)
            await sendNonEmbedNotification(message.channel, message.author, formattedMsg);

            // 2. Configured Log Channel Alert (agar alag set ho)
            if (data.channelId && data.channelId !== message.channel.id) {
                const targetChannel = message.guild.channels.cache.get(data.channelId);
                if (targetChannel && targetChannel.isTextBased()) {
                    await sendNonEmbedNotification(targetChannel, message.author, formattedMsg);
                }
            }
        }

        await data.save();
    });

    console.log('✔ Non-Embed Leveling System handler loaded.');
};
