const { 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder, 
    EmbedBuilder 
} = require('discord.js');
const StatsConfig = require('../models/stats');

const DEFAULT_FORMAT = '‧˚₊⊹👤Total Members {count}/{goal}';
const DEFAULT_DM = '🎉 Goal Achieved! {server} ne successfully {goal} members complete kar liye hain!';

// Channel name updater helper
async function updateStatsChannel(guild, config) {
    if (!config || !config.channelId) return;

    const channel = guild.channels.cache.get(config.channelId);
    if (!channel) return;

    const memberCount = guild.memberCount;
    const goal = config.memberGoal || 100;
    const format = config.channelFormat || DEFAULT_FORMAT;

    const newChannelName = format
        .replace(/{count}/gi, memberCount)
        .replace(/{goal}/gi, goal)
        .replace(/{server}/gi, guild.name);

    // Update channel name
    if (channel.name !== newChannelName) {
        await channel.setName(newChannelName).catch(err => console.error('Channel rename rate limit or error:', err.message));
    }

    // Check Goal Completion
    if (memberCount >= goal && !config.goalReached) {
        await StatsConfig.findOneAndUpdate({ guildId: guild.id }, { goalReached: true });

        const owner = await guild.fetchOwner().catch(() => null);
        if (owner) {
            const dmMessage = (config.dmText || DEFAULT_DM)
                .replace(/{count}/gi, memberCount)
                .replace(/{goal}/gi, goal)
                .replace(/{server}/gi, guild.name)
                .replace(/{user}/gi, `<@${owner.id}>`);

            const embed = new EmbedBuilder()
                .setColor('#2ECC71')
                .setTitle('🎯 Members Goal Completed!')
                .setDescription(dmMessage)
                .setTimestamp();

            await owner.send({ embeds: [embed] }).catch(() => {});
        }
    } else if (memberCount < goal && config.goalReached) {
        // Reset goal flag agar members decrease ho gaye
        await StatsConfig.findOneAndUpdate({ guildId: guild.id }, { goalReached: false });
    }
}

module.exports = (client) => {

    client.on('interactionCreate', async (interaction) => {
        // 1. Open Setup Modal
        if (interaction.isButton() && interaction.customId === 'open_stats_modal') {
            const data = await StatsConfig.findOne({ guildId: interaction.guild.id }) || {};

            const modal = new ModalBuilder()
                .setCustomId('stats_config_modal')
                .setTitle('Server Stats Configuration');

            const channelInput = new TextInputBuilder()
                .setCustomId('stats_channel_id')
                .setLabel('Stats Channel ID (Voice/Text)')
                .setStyle(TextInputStyle.Short)
                .setValue(data.channelId || '')
                .setRequired(true);

            const formatInput = new TextInputBuilder()
                .setCustomId('stats_channel_format')
                .setLabel('Channel Text Format')
                .setStyle(TextInputStyle.Short)
                .setValue(data.channelFormat || DEFAULT_FORMAT)
                .setRequired(true);

            const goalInput = new TextInputBuilder()
                .setCustomId('stats_member_goal')
                .setLabel('Members Goal')
                .setStyle(TextInputStyle.Short)
                .setValue(String(data.memberGoal || 100))
                .setRequired(true);

            const dmInput = new TextInputBuilder()
                .setCustomId('stats_goal_dm')
                .setLabel('Goal Complete DM Text')
                .setStyle(TextInputStyle.Paragraph)
                .setValue(data.dmText || DEFAULT_DM)
                .setRequired(false);

            modal.addComponents(
                new ActionRowBuilder().addComponents(channelInput),
                new ActionRowBuilder().addComponents(formatInput),
                new ActionRowBuilder().addComponents(goalInput),
                new ActionRowBuilder().addComponents(dmInput)
            );

            await interaction.showModal(modal);
        }

        // 2. Save Modal Configuration
        if (interaction.isModalSubmit() && interaction.customId === 'stats_config_modal') {
            await interaction.deferReply({ ephemeral: true });

            const channelId = interaction.fields.getTextInputValue('stats_channel_id').trim();
            const channelFormat = interaction.fields.getTextInputValue('stats_channel_format').trim();
            const rawGoal = interaction.fields.getTextInputValue('stats_member_goal').trim();
            const dmText = interaction.fields.getTextInputValue('stats_goal_dm');

            const memberGoal = parseInt(rawGoal, 10) || 100;

            const config = await StatsConfig.findOneAndUpdate(
                { guildId: interaction.guild.id },
                { channelId, channelFormat, memberGoal, dmText },
                { upsert: true, new: true }
            );

            await updateStatsChannel(interaction.guild, config);

            await interaction.editReply({ 
                content: `✅ Stats System successfully configure ho gaya!\nChannel: <#${channelId}>\nGoal: **${memberGoal}** members.` 
            });
        }
    });

    // 3. Live Member Join & Leave Listeners
    client.on('guildMemberAdd', async (member) => {
        const config = await StatsConfig.findOne({ guildId: member.guild.id });
        if (config) await updateStatsChannel(member.guild, config);
    });

    client.on('guildMemberRemove', async (member) => {
        const config = await StatsConfig.findOne({ guildId: member.guild.id });
        if (config) await updateStatsChannel(member.guild, config);
    });

    // 4. Test Command: §stats
    client.on('messageCreate', async (message) => {
        if (message.author.bot || !message.guild) return;

        if (message.content.trim() === '§stats') {
            const config = await StatsConfig.findOne({ guildId: message.guild.id });

            if (!config || !config.channelId) {
                return message.reply('⚠️ Pehle `/panel page:4` run karke stats channel set karein!');
            }

            const currentCount = message.guild.memberCount;
            const goal = config.memberGoal || 100;
            const previewName = (config.channelFormat || DEFAULT_FORMAT)
                .replace(/{count}/gi, currentCount)
                .replace(/{goal}/gi, goal)
                .replace(/{server}/gi, message.guild.name);

            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('📊 [TEST PREVIEW] Server Stats')
                .addFields(
                    { name: 'Channel Preview Name', value: `\`${previewName}\``, inline: false },
                    { name: 'Target Channel', value: `<#${config.channelId}>`, inline: true },
                    { name: 'Current Members', value: `${currentCount}`, inline: true },
                    { name: 'Target Goal', value: `${goal}`, inline: true }
                )
                .setTimestamp();

            // Force update real channel
            await updateStatsChannel(message.guild, config);

            await message.reply({ embeds: [embed] });
        }
    });

    console.log('✔ Stats handler loaded.');
};
