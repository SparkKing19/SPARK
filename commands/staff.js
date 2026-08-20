const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const ModerationConfig = require('../models/moderation');

function parseDuration(str) {
    if (!str) return null;
    const match = str.match(/^(\d+)(s|m|h|d)$/);
    if (!match) return null;
    const value = parseInt(match[1]);
    const unit = match[2];
    if (unit === 's') return value * 1000;
    if (unit === 'm') return value * 60 * 1000;
    if (unit === 'h') return value * 60 * 60 * 1000;
    if (unit === 'd') return value * 24 * 60 * 60 * 1000;
    return null;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('staff')
        .setDescription('Execute staff moderation action')
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Action to perform')
                .setRequired(true)
                .addChoices(
                    { name: 'Ban', value: 'ban' },
                    { name: 'Kick', value: 'kick' },
                    { name: 'Mute (Timeout)', value: 'mute' },
                    { name: 'Unmute', value: 'unmute' },
                    { name: 'Unban', value: 'unban' }
                )
        )
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Target user')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('limit')
                .setDescription('Time limit for mute (e.g. 10m, 1h, 1d)')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for punishment')
                .setRequired(false)
        ),
    async execute(interaction) {
        const config = await ModerationConfig.findOne({ guildId: interaction.guild.id });
        
        const isStaff = config?.staffRoleIds?.some(id => interaction.member.roles.cache.has(id));
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

        if (!isStaff && !isAdmin) {
            return interaction.reply({ content: '❌ Aapke paas `/staff` commands use karne ki permission nahi hai.', ephemeral: true });
        }

        const action = interaction.options.getString('action');
        const targetUser = interaction.options.getUser('user');
        const timeLimit = interaction.options.getString('limit');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        await interaction.deferReply();

        try {
            if (action === 'ban') {
                await interaction.guild.members.ban(targetUser.id, { reason: `${reason} | By: ${interaction.user.tag}` });
            } else if (action === 'kick') {
                if (!targetMember) return interaction.editReply('❌ User is server me nahi hai.');
                await targetMember.kick(`${reason} | By: ${interaction.user.tag}`);
            } else if (action === 'mute') {
                if (!targetMember) return interaction.editReply('❌ User is server me nahi hai.');
                const durationMs = parseDuration(timeLimit) || (10 * 60 * 1000); // Default 10 min
                await targetMember.timeout(durationMs, `${reason} | By: ${interaction.user.tag}`);
            } else if (action === 'unmute') {
                if (!targetMember) return interaction.editReply('❌ User is server me nahi hai.');
                await targetMember.timeout(null, `Unmuted by ${interaction.user.tag}`);
            } else if (action === 'unban') {
                await interaction.guild.members.unban(targetUser.id, `Unbanned by ${interaction.user.tag}`);
            }

            const successEmbed = new EmbedBuilder()
                .setColor('#2ECC71')
                .setTitle(`🛡️ Staff Action: ${action.toUpperCase()}`)
                .addFields(
                    { name: 'Target User', value: `<@${targetUser.id}> (${targetUser.tag})`, inline: true },
                    { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Time / Limit', value: timeLimit || 'Permanent / N/A', inline: true },
                    { name: 'Reason', value: reason, inline: false }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [successEmbed] });

            // Send to Mod Logs Channel
            if (config?.modLogsChannelId) {
                const logsChannel = interaction.guild.channels.cache.get(config.modLogsChannelId);
                if (logsChannel) await logsChannel.send({ embeds: [successEmbed] });
            }
        } catch (error) {
            console.error('Staff action error:', error);
            await interaction.editReply({ content: `❌ Action perform karte waqt error aaya: \`${error.message}\`` });
        }
    }
};
