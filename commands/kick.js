const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const ModerationConfig = require('../models/moderation');

const BOT_OWNERS = ['1266728371719508062', '1474216218792558735'];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Server se member ko kick karein')
        .addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Kick reason').setRequired(false)),

    async execute(interaction) {
        const config = await ModerationConfig.findOne({ guildId: interaction.guild.id });
        const isBotOwner = BOT_OWNERS.includes(interaction.user.id);
        const isOwner = interaction.user.id === interaction.guild.ownerId;
        const isExtraOwner = config?.extraOwners?.includes(interaction.user.id);
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        const userGrantedPerms = config?.userModPerms?.get(interaction.user.id) || [];
        const hasPerm = isBotOwner || isOwner || isExtraOwner || isAdmin || userGrantedPerms.includes('kick');

        if (!hasPerm) {
            return interaction.reply({ content: '❌ You do not have permission to execute `/kick`.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });
        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (!member) return interaction.editReply('❌ User server me nahi hai.');
        if (!member.kickable) return interaction.editReply('❌ Bot is member ko kick nahi kar sakta.');

        try {
            await member.kick(`${reason} \vert{} Moderator:${interaction.user.tag}`);

            const logEmbed = new EmbedBuilder()
                .setColor('#E67E22')
                .setTitle('👢 Member Kicked')
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

            return interaction.editReply(`👢 Successfully kicked **${targetUser.tag}**.`);
        } catch (err) {
            return interaction.editReply(`❌ Kick failed: \`${err.message}\``);
        }
    }
};
