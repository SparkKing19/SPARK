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
        .setDescription('Execute advanced staff moderation actions')
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Action to perform')
                .setRequired(true)
                .addChoices(
                    { name: 'Ban', value: 'ban' },
                    { name: 'Kick', value: 'kick' },
                    { name: 'Mute (Timeout)', value: 'mute' },
                    { name: 'Unmute', value: 'unmute' },
                    { name: 'Unban', value: 'unban' },
                    { name: 'Purge / Clear Messages', value: 'purge' },
                    { name: 'Add Role', value: 'role_add' },
                    { name: 'Remove Role', value: 'role_remove' },
                    { name: 'Lock Channel', value: 'lock' },
                    { name: 'Unlock Channel', value: 'unlock' },
                    { name: 'Slowmode', value: 'slowmode' },
                    { name: 'Warn User', value: 'warn' },
                    { name: 'Change Nickname', value: 'setnick' }
                )
        )
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Target user (For ban/kick/mute/role/warn/nick)')
                .setRequired(false)
        )
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('Role to add or remove')
                .setRequired(false)
        )
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Number of messages to clear (1-100) or Slowmode seconds (0-21600)')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('limit')
                .setDescription('Duration limit for mute (e.g. 10m, 1h, 1d)')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('value')
                .setDescription('New Nickname or specific custom value')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for punishment / action')
                .setRequired(false)
        ),

    async execute(interaction) {
        const config = await ModerationConfig.findOne({ guildId: interaction.guild.id });
        
        const isStaff = config?.staffRoleIds?.some(id => interaction.member.roles.cache.has(id));
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

        if (!isStaff && !isAdmin) {
            return interaction.reply({ content: '❌ You do not have permission to use `/staff` commands.', ephemeral: true });
        }

        const action = interaction.options.getString('action');
        const targetUser = interaction.options.getUser('user');
        const targetRole = interaction.options.getRole('role');
        const amount = interaction.options.getInteger('amount');
        const timeLimit = interaction.options.getString('limit');
        const value = interaction.options.getString('value');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        await interaction.deferReply();

        try {
            let targetMember = null;
            if (targetUser) {
                targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
            }

            let logDetails = [];

            // 1. BAN
            if (action === 'ban') {
                if (!targetUser) return interaction.editReply('❌ Please mention a valid user.');
                await interaction.guild.members.ban(targetUser.id, { reason: `${reason} | By: ${interaction.user.tag}` });
                logDetails.push({ name: 'Target User', value: `<@${targetUser.id}> (${targetUser.tag})`, inline: true });
            }

            // 2. KICK
            else if (action === 'kick') {
                if (!targetMember) return interaction.editReply('❌ User is not in this server.');
                await targetMember.kick(`${reason} | By: ${interaction.user.tag}`);
                logDetails.push({ name: 'Target User', value: `<@${targetUser.id}> (${targetUser.tag})`, inline: true });
            }

            // 3. MUTE (TIMEOUT)
            else if (action === 'mute') {
                if (!targetMember) return interaction.editReply('❌ User is not in this server.');
                const durationMs = parseDuration(timeLimit) || (10 * 60 * 1000);
                await targetMember.timeout(durationMs, `${reason} | By: ${interaction.user.tag}`);
                logDetails.push(
                    { name: 'Target User', value: `<@${targetUser.id}>`, inline: true },
                    { name: 'Duration', value: timeLimit || '10m (Default)', inline: true }
                );
            }

            // 4. UNMUTE
            else if (action === 'unmute') {
                if (!targetMember) return interaction.editReply('❌ User is not in this server.');
                await targetMember.timeout(null, `Unmuted by ${interaction.user.tag}`);
                logDetails.push({ name: 'Target User', value: `<@${targetUser.id}>`, inline: true });
            }

            // 5. UNBAN
            else if (action === 'unban') {
                if (!targetUser) return interaction.editReply('❌ Please specify a user ID/mention.');
                await interaction.guild.members.unban(targetUser.id, `Unbanned by ${interaction.user.tag}`);
                logDetails.push({ name: 'Target User', value: `<@${targetUser.id}>`, inline: true });
            }

            // 6. PURGE / CLEAR MESSAGES
            else if (action === 'purge') {
                const count = amount || 10;
                if (count < 1 || count > 100) return interaction.editReply('❌ Please enter a message amount between 1 and 100.');
                
                const deleted = await interaction.channel.bulkDelete(count, true);
                logDetails.push(
                    { name: 'Channel', value: `<#${interaction.channel.id}>`, inline: true },
                    { name: 'Messages Deleted', value: `${deleted.size}`, inline: true }
                );
            }

            // 7. ADD ROLE
            else if (action === 'role_add') {
                if (!targetMember || !targetRole) return interaction.editReply('❌ Please select both a User and a Role.');
                await targetMember.roles.add(targetRole, `${reason} | By: ${interaction.user.tag}`);
                logDetails.push(
                    { name: 'Target User', value: `<@${targetUser.id}>`, inline: true },
                    { name: 'Role Added', value: `<@&${targetRole.id}>`, inline: true }
                );
            }

            // 8. REMOVE ROLE
            else if (action === 'role_remove') {
                if (!targetMember || !targetRole) return interaction.editReply('❌ Please select both a User and a Role.');
                await targetMember.roles.remove(targetRole, `${reason} | By: ${interaction.user.tag}`);
                logDetails.push(
                    { name: 'Target User', value: `<@${targetUser.id}>`, inline: true },
                    { name: 'Role Removed', value: `<@&${targetRole.id}>`, inline: true }
                );
            }

            // 9. LOCK CHANNEL
            else if (action === 'lock') {
                await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                    SendMessages: false
                });
                logDetails.push({ name: 'Locked Channel', value: `<#${interaction.channel.id}>`, inline: true });
            }

            // 10. UNLOCK CHANNEL
            else if (action === 'unlock') {
                await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                    SendMessages: null
                });
                logDetails.push({ name: 'Unlocked Channel', value: `<#${interaction.channel.id}>`, inline: true });
            }

            // 11. SLOWMODE
            else if (action === 'slowmode') {
                const seconds = amount !== null ? amount : 5;
                await interaction.channel.setRateLimitPerUser(seconds, `${reason} | By: ${interaction.user.tag}`);
                logDetails.push(
                    { name: 'Channel', value: `<#${interaction.channel.id}>`, inline: true },
                    { name: 'Slowmode Delay', value: `${seconds} Seconds`, inline: true }
                );
            }

            // 12. WARN USER (DM Alert + Log)
            else if (action === 'warn') {
                if (!targetMember) return interaction.editReply('❌ User is not in this server.');
                
                const warnEmbed = new EmbedBuilder()
                    .setColor('#ED4245')
                    .setTitle(`⚠️ Warning from ${interaction.guild.name}`)
                    .setDescription(`You have received an official warning from staff.\n\n**Reason:** ${reason}`)
                    .setTimestamp();

                await targetMember.send({ embeds: [warnEmbed] }).catch(() => {});
                logDetails.push({ name: 'Warned User', value: `<@${targetUser.id}>`, inline: true });
            }

            // 13. SET NICKNAME
            else if (action === 'setnick') {
                if (!targetMember) return interaction.editReply('❌ User is not in this server.');
                const newNick = value || null;
                await targetMember.setNickname(newNick, `${reason} | By: ${interaction.user.tag}`);
                logDetails.push(
                    { name: 'Target User', value: `<@${targetUser.id}>`, inline: true },
                    { name: 'New Nickname', value: newNick || 'Reset to Default', inline: true }
                );
            }

            const successEmbed = new EmbedBuilder()
                .setColor('#2ECC71')
                .setTitle(`🛡️ Staff Action: ${action.replace('_', ' ').toUpperCase()}`)
                .addFields(
                    { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
                    ...logDetails,
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
            await interaction.editReply({ content: `❌ An error occurred while executing this action: \`${error.message}\`` });
        }
    }
};
                                 
