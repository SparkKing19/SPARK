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
        .setDescription('Execute staff moderation actions')
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Action to perform')
                .setRequired(true)
                .addChoices(
                    { name: 'Ban', value: 'ban' },
                    { name: 'Kick', value: 'kick' },
                    { name: 'Timeout / Mute', value: 'timeout' },
                    { name: 'Remove Timeout / Unmute', value: 'untimeout' },
                    { name: 'Unban', value: 'unban' },
                    { name: 'Purge / Clear Messages', value: 'purge' },
                    { name: 'Add Role', value: 'role_add' },
                    { name: 'Remove Role', value: 'role_remove' },
                    { name: 'Lock Channel', value: 'lock' },
                    { name: 'Unlock Channel', value: 'unlock' },
                    { name: 'Slowmode', value: 'slowmode' },
                    { name: 'Warn User', value: 'warn' }
                )
        )
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Target user')
                .setRequired(false)
        )
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('Role to add or remove')
                .setRequired(false)
        )
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Number of messages to clear (1-100) or slowmode seconds')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('limit')
                .setDescription('Timeout duration (e.g. 10m, 1h, 1d)')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for the action')
                .setRequired(false)
        ),

    async execute(interaction) {
        const config = await ModerationConfig.findOne({ guildId: interaction.guild.id });
        const action = interaction.options.getString('action');

        // Permission Verification Engine
        const isOwner = interaction.user.id === interaction.guild.ownerId;
        const isExtraOwner = config?.extraOwners?.includes(interaction.user.id);
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        const userGrantedPerms = config?.userModPerms?.get(interaction.user.id) || [];
        const hasCustomPerm = userGrantedPerms.includes(action) || userGrantedPerms.includes(action.replace('role_add', 'role').replace('role_remove', 'role'));

        if (!isOwner && !isExtraOwner && !isAdmin && !hasCustomPerm) {
            return interaction.reply({ 
                content: `❌ You do not have permission to execute the **${action}** action. Contact Server Owner or get access via \`%pr @user\`.`, 
                ephemeral: true 
            });
        }

        const targetUser = interaction.options.getUser('user');
        const targetRole = interaction.options.getRole('role');
        const amount = interaction.options.getInteger('amount');
        const timeLimit = interaction.options.getString('limit');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        await interaction.deferReply();

        try {
            let targetMember = null;
            if (targetUser) {
                targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
            }

            let logDetails = [];

            if (action === 'ban') {
                if (!targetUser) return interaction.editReply('❌ Please specify a valid user.');
                await interaction.guild.members.ban(targetUser.id, { reason: `${reason} | Staff: ${interaction.user.tag}` });
                logDetails.push({ name: 'Target User', value: `<@${targetUser.id}> (${targetUser.tag})`, inline: true });
            } 
            else if (action === 'kick') {
                if (!targetMember) return interaction.editReply('❌ User is not in this server.');
                await targetMember.kick(`${reason} | Staff: ${interaction.user.tag}`);
                logDetails.push({ name: 'Target User', value: `<@${targetUser.id}> (${targetUser.tag})`, inline: true });
            } 
            else if (action === 'timeout') {
                if (!targetMember) return interaction.editReply('❌ User is not in this server.');
                const durationMs = parseDuration(timeLimit) || (10 * 60 * 1000);
                await targetMember.timeout(durationMs, `${reason} | Staff: ${interaction.user.tag}`);
                logDetails.push(
                    { name: 'Target User', value: `<@${targetUser.id}>`, inline: true },
                    { name: 'Duration', value: timeLimit || '10m', inline: true }
                );
            } 
            else if (action === 'untimeout') {
                if (!targetMember) return interaction.editReply('❌ User is not in this server.');
                await targetMember.timeout(null, `Timeout removed by ${interaction.user.tag}`);
                logDetails.push({ name: 'Target User', value: `<@${targetUser.id}>`, inline: true });
            } 
            else if (action === 'unban') {
                if (!targetUser) return interaction.editReply('❌ Please specify a user ID.');
                await interaction.guild.members.unban(targetUser.id, `Unbanned by ${interaction.user.tag}`);
                logDetails.push({ name: 'Target User', value: `<@${targetUser.id}>`, inline: true });
            } 
            else if (action === 'purge') {
                const count = amount || 10;
                if (count < 1 || count > 100) return interaction.editReply('❌ Enter an amount between 1 and 100.');
                const deleted = await interaction.channel.bulkDelete(count, true);
                logDetails.push(
                    { name: 'Channel', value: `<#${interaction.channel.id}>`, inline: true },
                    { name: 'Messages Cleared', value: `${deleted.size}`, inline: true }
                );
            } 
            else if (action === 'role_add') {
                if (!targetMember || !targetRole) return interaction.editReply('❌ Please specify both User and Role.');
                await targetMember.roles.add(targetRole, `${reason} | Staff: ${interaction.user.tag}`);
                logDetails.push(
                    { name: 'Target User', value: `<@${targetUser.id}>`, inline: true },
                    { name: 'Role Added', value: `<@&${targetRole.id}>`, inline: true }
                );
            } 
            else if (action === 'role_remove') {
                if (!targetMember || !targetRole) return interaction.editReply('❌ Please specify both User and Role.');
                await targetMember.roles.remove(targetRole, `${reason} | Staff: ${interaction.user.tag}`);
                logDetails.push(
                    { name: 'Target User', value: `<@${targetUser.id}>`, inline: true },
                    { name: 'Role Removed', value: `<@&${targetRole.id}>`, inline: true }
                );
            } 
            else if (action === 'lock') {
                await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
                logDetails.push({ name: 'Locked Channel', value: `<#${interaction.channel.id}>`, inline: true });
            } 
            else if (action === 'unlock') {
                await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null });
                logDetails.push({ name: 'Unlocked Channel', value: `<#${interaction.channel.id}>`, inline: true });
            } 
            else if (action === 'slowmode') {
                const seconds = amount !== null ? amount : 5;
                await interaction.channel.setRateLimitPerUser(seconds, `${reason} | Staff: ${interaction.user.tag}`);
                logDetails.push({ name: 'Slowmode Delay', value: `${seconds} Seconds`, inline: true });
            } 
            else if (action === 'warn') {
                if (!targetMember) return interaction.editReply('❌ User is not in this server.');
                const warnEmbed = new EmbedBuilder()
                    .setColor('#ED4245')
                    .setTitle(`⚠️ Official Warning from ${interaction.guild.name}`)
                    .setDescription(`You have received a formal warning.\n\n**Reason:** ${reason}`)
                    .setTimestamp();
                await targetMember.send({ embeds: [warnEmbed] }).catch(() => {});
                logDetails.push({ name: 'Warned User', value: `<@${targetUser.id}>`, inline: true });
            }

            const successEmbed = new EmbedBuilder()
                .setColor('#2ECC71')
                .setTitle(`🛡️ Staff Action Executed: ${action.replace('_', ' ').toUpperCase()}`)
                .addFields(
                    { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
                    ...logDetails,
                    { name: 'Reason', value: reason, inline: false }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [successEmbed] });

            if (config?.modLogsChannelId) {
                const logsChannel = interaction.guild.channels.cache.get(config.modLogsChannelId);
                if (logsChannel) await logsChannel.send({ embeds: [successEmbed] }).catch(() => {});
            }
        } catch (error) {
            console.error('Staff action error:', error);
            await interaction.editReply({ content: `❌ Error executing action: \`${error.message}\`` });
        }
    }
};
