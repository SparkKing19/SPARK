const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const ModerationConfig = require('../models/moderation');

const BOT_OWNERS = ['1266728371719508062', '1474216218792558735'];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('purge')
        .setDescription('Channel se messages bulk delete karein')
        .addIntegerOption(opt => opt.setName('amount').setDescription('Delete karne wale messages ki sankhya (1-100)').setMinValue(1).setMaxValue(100).setRequired(true)),

    async execute(interaction) {
        const config = await ModerationConfig.findOne({ guildId: interaction.guild.id });
        const isBotOwner = BOT_OWNERS.includes(interaction.user.id);
        const isOwner = interaction.user.id === interaction.guild.ownerId;
        const isExtraOwner = config?.extraOwners?.includes(interaction.user.id);
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        const userGrantedPerms = config?.userModPerms?.get(interaction.user.id) || [];
        const hasPerm = isBotOwner || isOwner || isExtraOwner || isAdmin || userGrantedPerms.includes('purge');

        if (!hasPerm) {
            return interaction.reply({ content: '❌ You do not have permission to execute `/purge`.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });
        const amount = interaction.options.getInteger('amount');

        try {
            const deleted = await interaction.channel.bulkDelete(amount, true);

            const logEmbed = new EmbedBuilder()
                .setColor('#F39C12')
                .setTitle('🧹 Messages Purged')
                .addFields(
                    { name: 'Channel', value: `<#${interaction.channel.id}>`, inline: true },
                    { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Deleted Count', value: `\`${deleted.size}\``, inline: true }
                )
                .setTimestamp();

            if (config?.modLogsChannelId) {
                const logsChannel = interaction.guild.channels.cache.get(config.modLogsChannelId);
                if (logsChannel) await logsChannel.send({ embeds: [logEmbed] }).catch(() => {});
            }

            return interaction.editReply(`🧹 **${deleted.size}** messages successfully delete kar diye gaye.`);
        } catch (err) {
            return interaction.editReply(`❌ Purge error: \`${err.message}\``);
        }
    }
};
