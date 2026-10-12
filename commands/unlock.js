const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const ModerationConfig = require('../models/moderation');

const BOT_OWNERS = ['1266728371719508062', '1474216218792558735'];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unlock')
        .setDescription('Channel ko unlock karein')
        .addChannelOption(opt => opt.setName('channel').setDescription('Channel to unlock (default current channel)').setRequired(false))
        .addStringOption(opt => opt.setName('reason').setDescription('Unlock karne ka reason').setRequired(false)),

    async execute(interaction) {
        const config = await ModerationConfig.findOne({ guildId: interaction.guild.id });
        const isBotOwner = BOT_OWNERS.includes(interaction.user.id);
        const isOwner = interaction.user.id === interaction.guild.ownerId;
        const isExtraOwner = config?.extraOwners?.includes(interaction.user.id);
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        const userGrantedPerms = config?.userModPerms?.get(interaction.user.id) || [];
        const hasPerm = isBotOwner || isOwner || isExtraOwner || isAdmin || userGrantedPerms.includes('unlock');

        if (!hasPerm) {
            return interaction.reply({ content: '❌ You do not have permission to execute `/unlock`.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const everyone = interaction.guild.roles.everyone;

        try {
            if (targetChannel.isVoiceBased()) {
                await targetChannel.permissionOverwrites.edit(everyone, {
                    Connect: null,
                    Speak: null,
                    UseSoundboard: null,
                    UseExternalSounds: null,
                    Stream: null
                }, { reason: `${reason} \vert{} Moderator:${interaction.user.tag}` });
            } else {
                await targetChannel.permissionOverwrites.edit(everyone, {
                    SendMessages: null,
                    SendMessagesInThreads: null,
                    CreatePublicThreads: null,
                    CreatePrivateThreads: null
                }, { reason: `${reason} \vert{} Moderator:${interaction.user.tag}` });
            }

            const logEmbed = new EmbedBuilder()
                .setColor('#2ECC71')
                .setTitle('🔓 Channel Unlocked')
                .addFields(
                    { name: 'Channel', value: `<#${targetChannel.id}> (\`${targetChannel.id}\`)`, inline: true },
                    { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Reason', value: reason, inline: false }
                )
                .setTimestamp();

            if (config?.modLogsChannelId) {
                const logsChannel = interaction.guild.channels.cache.get(config.modLogsChannelId);
                if (logsChannel) await logsChannel.send({ embeds: [logEmbed] }).catch(() => {});
            }

            return interaction.editReply(`🔓 Successfully unlocked <#${targetChannel.id}>.`);
        } catch (err) {
            return interaction.editReply(`❌ Error unlocking channel: \`${err.message}\``);
        }
    }
};
