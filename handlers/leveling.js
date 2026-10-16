const { 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder, 
    EmbedBuilder,
    PermissionsBitField 
} = require('discord.js');
const LevelingConfig = require('../models/leveling');
const { parseVariables } = require('../utils/variables');
const { isFeatureEnabled } = require('../utils/featureCheck');

const BOT_OWNERS = [
    '1549995551288852584',
    '1266728371719508062', // FZBOY
    '1474216218792558735'  // DAREQUEEN
];

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

    // 3. Message Counter, Commands & Dynamic Dual Level-Up Engine (No Cooldown)
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

            const lbEmbed = new EmbedBuilder()
                .setColor('#5865F2')
                .setAuthor({ 
                    name: `${message.guild.name} — Top 10 Level Leaderboard`, 
                    iconURL: message.guild.iconURL({ dynamic: true }) 
                })
                .setDescription(lbRows.join('\n'))
                .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.displayAvatarURL() });

            return message.reply({ embeds: [lbEmbed] });
        }

        // C. COMMAND: &rank
        if (content.toLowerCase().startsWith('&rank')) {
            const target = message.mentions.users.first() || message.author;
            const data = await LevelingConfig.findOne({ guildId: message.guild.id });

            if (!data) return message.reply('⚠️ Leveling is not configured for this server yet.');

            const userRecord = data.users.find(u => u.userId === target.id) || { level: 0, messages: 0 };
            const requiredForNext = (userRecord.level + 1) * data.messagesPerLevel;

            const rankEmbed = new EmbedBuilder()
                .setColor('#F1C40F')
                .setAuthor({ name: `${target.username}'s Rank Card`, iconURL: target.displayAvatarURL() })
                .addFields(
                    { name: '🏆 Level', value: `\`Level ${userRecord.level}\``, inline: true },
                    { name: '💬 Progress', value: `\`${userRecord.messages} / ${requiredForNext} msgs\``, inline: true },
                    { name: '⚡ Rate', value: `\`+${data.messagesPerLevel} msgs/lvl\``, inline: true }
                )
                .setFooter({ text: 'Leveling System' });

            return message.reply({ embeds: [rankEmbed] });
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

            const levelEmbed = new EmbedBuilder()
                .setColor('#2ECC71')
                .setDescription(formattedMsg);

            await message.channel.send({ embeds: [levelEmbed] }).catch(() => {});

            if (data.channelId && data.channelId !== message.channel.id) {
                const targetChannel = message.guild.channels.cache.get(data.channelId);
                if (targetChannel && targetChannel.isTextBased()) {
                    await targetChannel.send({ embeds: [levelEmbed] }).catch(() => {});
                }
            }
        }

        await data.save();
    });

    console.log('✔ Leveling System handler loaded.');
};
                    
