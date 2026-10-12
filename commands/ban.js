const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const ModerationConfig = require('../models/moderation');

const BOT_OWNERS = ['1266728371719508062', '1474216218792558735'];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Server se member ko ban karein')
        .addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Ban reason').setRequired(false)),

    async execute(interaction) {
        const config = await ModerationConfig.findOne({ guildId: interaction.guild.id });
        const isBotOwner = BOT_OWNERS.includes(interaction.user.id);
        const isOwner = interaction.user.id === interaction.guild.ownerId;
        const isExtraOwner = config?.extraOwners?.includes(interaction.user.id);
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        const userGrantedPerms = config?.userModPerms?.get(interaction.user.id) || [];
        const hasPerm = isBotOwner || isOwner || isExtraOwner || isAdmin || userGrantedPerms.includes('ban');

        if (!hasPerm) {
            return interaction.reply({ content: '❌ You do not have permission to execute `/ban`.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });
        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (member && !member.bannable) {
            return interaction.editReply('❌ Bot ke paas is user ko ban karne ki authority/role position nahi hai.');
        }

        try {
            await interaction.guild.members.ban(targetUser.id, { reason: `${reason} \vert{} Moderator:${interaction.user.tag}` });

            const logEmbed = new EmbedBuilder()
                .setColor('#C0392B')
                .setTitle('🔨 Member Banned')
                .addFields(
                    { name: 'Target', value: `<@${targetUser.id}> (\`${targetUser.id}\`)`, inline: true },
                    { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Reason', value: reason, inline: false }
                )
                .setTimestamp();

            if (config?.modLogsChannelId) {
                const logsChannel = interaction.guild.channels.cache.get(config.modLogsChannelId);
                if (logsChannel) await logsChannel.send({ embeds: [logEmbed] }).catch(() => {});
            }

            return interaction.editReply(`🔨 Successfully banned **${targetUser.tag}**.`);
        } catch (err) {
            return interaction.editReply(`❌ Ban failed: \`${err.message}\``);
        }
    }
};
