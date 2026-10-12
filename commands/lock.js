const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const ModerationConfig = require('../models/moderation');

const BOT_OWNERS = ['1266728371719508062', '1474216218792558735'];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lock')
        .setDescription('Channel ko lock karein (Text aur Voice dono support)')
        .addChannelOption(opt => opt.setName('channel').setDescription('Channel to lock (default current channel)').setRequired(false))
        .addStringOption(opt => opt.setName('reason').setDescription('Lock karne ka reason').setRequired(false)),

    async execute(interaction) {
        const config = await ModerationConfig.findOne({ guildId: interaction.guild.id });
        const isBotOwner = BOT_OWNERS.includes(interaction.user.id);
        const isOwner = interaction.user.id === interaction.guild.ownerId;
        const isExtraOwner = config?.extraOwners?.includes(interaction.user.id);
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        const userGrantedPerms = config?.userModPerms?.get(interaction.user.id) || [];
        const hasPerm = isBotOwner || isOwner || isExtraOwner || isAdmin || userGrantedPerms.includes('lock');

        if (!hasPerm) {
            return interaction.reply({ content: '❌ You do not have permission to execute `/lock`.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const everyone = interaction.guild.roles.everyone;

        try {
            if (targetChannel.isVoiceBased()) {
                await targetChannel.permissionOverwrites.edit(everyone, {
                    Connect: false,
                    Speak: false,
                    UseSoundboard: false,
                    UseExternalSounds: false,
                    Stream: false
                }, { reason: `${reason} \vert{} Moderator:${interaction.user.tag}` });
            } else {
                await targetChannel.permissionOverwrites.edit(everyone, {
                    SendMessages: false,
                    SendMessagesInThreads: false,
                    CreatePublicThreads: false,
                    CreatePrivateThreads: false
                }, { reason: `${reason} \vert{} Moderator:${interaction.user.tag}` });
            }

            const logEmbed = new EmbedBuilder()
                .setColor('#ED4245')
                .setTitle('🔒 Channel Locked')
                .addFields(
                    { name: 'Channel', value: `<#${targetChannel.id}> (\`${targetChannel.id}\`)`, inline: true },
                    { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Type', value: targetChannel.isVoiceBased() ? 'Voice Channel' : 'Text Channel', inline: true },
                    { name: 'Reason', value: reason, inline: false }
                )
                .setTimestamp();

            if (config?.modLogsChannelId) {
                const logsChannel = interaction.guild.channels.cache.get(config.modLogsChannelId);
                if (logsChannel) await logsChannel.send({ embeds: [logEmbed] }).catch(() => {});
            }

            return interaction.editReply(`🔒 Successfully locked <#${targetChannel.id}>.`);
        } catch (err) {
            return interaction.editReply(`❌ Error locking channel: \`${err.message}\``);
        }
    }
};
