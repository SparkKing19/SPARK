const { 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder, 
    EmbedBuilder 
} = require('discord.js');
const LevelingConfig = require('../models/leveling');
const { parseVariables } = require('../utils/variables');
const { isFeatureEnabled } = require('../utils/featureCheck');

const cooldowns = new Set(); // 2-second anti-spam per user

module.exports = (client) => {

    // 1. Setup Modal Trigger via /panel (Book 3 Page 13)
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

            await interaction.showModal(modal);
        }

        // 2. Save Modal Configuration
        if (interaction.isModalSubmit() && interaction.customId === 'leveling_config_modal') {
            await interaction.deferReply({ ephemeral: true });

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
                content: `✅ Leveling system configured!\n• **Step:** \`${messagesPerLevel}\` msgs/level (Lvl 1: ${messagesPerLevel}, Lvl 2: ${messagesPerLevel * 2}, Lvl 3:${messagesPerLevel * 3})\n• **Notification Channel:** ${channelId ? `<#${channelId}>` : '`Current Chat`'}`
            });
        }
    });

    // 3. Message Counter & Dynamic Level Up Trigger
    client.on('messageCreate', async (message) => {
        if (!message.guild || message.author.bot) return;

        // Check if feature is enabled via %manage
        const enabled = await isFeatureEnabled(message.guild.id, 'leveling', message.author.id);
        if (!enabled) return;

        // 2-second cooldown to prevent spamming
        const cdKey = `${message.guild.id}_${message.author.id}`;
        if (cooldowns.has(cdKey)) return;
        cooldowns.add(cdKey);
        setTimeout(() => cooldowns.delete(cdKey), 2000);

        let data = await LevelingConfig.findOne({ guildId: message.guild.id });
        if (!data) return;

        let userRecord = data.users.find(u => u.userId === message.author.id);
        if (!userRecord) {
            userRecord = { userId: message.author.id, messages: 0, level: 0 };
            data.users.push(userRecord);
        }

        userRecord.messages += 1;

        // Required messages for next level = (Current Level + 1) * messagesPerLevel
        // Level 1: 1 * 25 = 25
        // Level 2: 2 * 25 = 50
        // Level 3: 3 * 25 = 75
        const nextLevel = userRecord.level + 1;
        const requiredForNext = nextLevel * data.messagesPerLevel;

        if (userRecord.messages >= requiredForNext) {
            userRecord.level = nextLevel;
            userRecord.messages = 0; // Reset message progress for next level tier

            // Format message using Universal Variables Engine
            let formattedMsg = parseVariables(data.levelUpMessage, {
                member: message.member,
                user: message.author,
                guild: message.guild
            });
            formattedMsg = formattedMsg.replace(/{level}/g, `${userRecord.level}`);

            // Clean Avatar Author Embed Style (Similar to Invite Tracker joined/left style)
            const levelEmbed = new EmbedBuilder()
                .setColor('#2ECC71')
                .setAuthor({
                    name: `${message.author.username} leveled up to Level${userRecord.level}!`,
                    iconURL: message.author.displayAvatarURL()
                })
                .setDescription(formattedMsg)
                .setTimestamp();

            // Destination channel determination
            const targetChannel = (data.channelId && message.guild.channels.cache.get(data.channelId)) 
                ? message.guild.channels.cache.get(data.channelId) 
                : message.channel;

            if (targetChannel) {
                await targetChannel.send({ embeds: [levelEmbed] }).catch(() => {});
            }
        }

        await data.save();
    });

    // 4. Rank Preview Command: &rank
    client.on('messageCreate', async (message) => {
        if (!message.guild || message.author.bot) return;

        if (message.content.trim().startsWith('&rank')) {
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
                .setFooter({ text: 'Leveling System' })
                .setTimestamp();

            return message.reply({ embeds: [rankEmbed] });
        }
    });

    console.log('✔ Leveling System handler loaded.');
};
