const { 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder, 
    ChannelType, 
    PermissionFlagsBits 
} = require('discord.js');
const TempVCConfig = require('../models/tempvc');

module.exports = (client) => {
    // 1. Setup Interaction
    client.on('interactionCreate', async (interaction) => {
        if (interaction.isButton() && interaction.customId === 'open_tempvc_modal') {
            const data = await TempVCConfig.findOne({ guildId: interaction.guild.id }) || {};

            const modal = new ModalBuilder()
                .setCustomId('tempvc_config_modal')
                .setTitle('Voice Generator Configuration');

            const input = new TextInputBuilder()
                .setCustomId('tempvc_ids')
                .setLabel('Hub VC ID || Category ID')
                .setPlaceholder('HUB_VC_CHANNEL_ID || TARGET_CATEGORY_ID')
                .setStyle(TextInputStyle.Short)
                .setValue(data.hubVoiceChannelId && data.targetCategoryId ? `${data.hubVoiceChannelId} || ${data.targetCategoryId}` : '')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
        }

        if (interaction.isModalSubmit() && interaction.customId === 'tempvc_config_modal') {
            const rawIds = interaction.fields.getTextInputValue('tempvc_ids');
            const [hubVoiceChannelId, targetCategoryId] = rawIds.split('||').map(s => s?.trim());

            await TempVCConfig.findOneAndUpdate(
                { guildId: interaction.guild.id },
                { hubVoiceChannelId, targetCategoryId },
                { upsert: true, new: true }
            );

            await interaction.reply({ content: '✅ Voice Generator configured successfully!', ephemeral: true });
        }
    });

    // 2. Dynamic Join-To-Create & Auto-Delete Logic
    client.on('voiceStateUpdate', async (oldState, newState) => {
        const guild = newState.guild || oldState.guild;
        if (!guild) return;

        const config = await TempVCConfig.findOne({ guildId: guild.id });
        if (!config || !config.hubVoiceChannelId) return;

        // A. User Joined Hub Channel -> Create Temp VC & Move
        if (newState.channelId === config.hubVoiceChannelId) {
            const member = newState.member;
            if (!member || member.user.bot) return;

            try {
                const channelName = `🔊 ${member.user.username}'s VC`;

                const createdChannel = await guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildVoice,
                    parent: config.targetCategoryId && guild.channels.cache.has(config.targetCategoryId) ? config.targetCategoryId : null,
                    permissionOverwrites: [
                        {
                            id: member.id,
                            allow: [
                                PermissionFlagsBits.ManageChannels,
                                PermissionFlagsBits.MuteMembers,
                                PermissionFlagsBits.DeafenMembers,
                                PermissionFlagsBits.MoveMembers,
                                PermissionFlagsBits.Connect,
                                PermissionFlagsBits.Speak
                            ]
                        },
                        {
                            id: guild.roles.everyone.id,
                            allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
                        },
                        {
                            id: client.user.id,
                            allow: [
                                PermissionFlagsBits.ManageChannels,
                                PermissionFlagsBits.MoveMembers,
                                PermissionFlagsBits.Connect
                            ]
                        }
                    ]
                });

                // Move Member to Newly Created Voice Channel
                await member.voice.setChannel(createdChannel).catch(console.error);

                // Save to Database
                await TempVCConfig.findOneAndUpdate(
                    { guildId: guild.id },
                    { $push: { activeChannels: { channelId: createdChannel.id, ownerId: member.id } } }
                );
            } catch (error) {
                console.error('Error creating temporary voice channel:', error);
            }
        }

        // B. User Left Channel -> Auto-Delete if empty
        if (oldState.channelId && oldState.channelId !== config.hubVoiceChannelId) {
            const activeList = config.activeChannels || [];
            const isActiveTempVC = activeList.some(c => c.channelId === oldState.channelId);

            if (isActiveTempVC) {
                const voiceChannel = guild.channels.cache.get(oldState.channelId) || await guild.channels.fetch(oldState.channelId).catch(() => null);

                if (voiceChannel && voiceChannel.members.size === 0) {
                    await voiceChannel.delete().catch(() => {});

                    await TempVCConfig.findOneAndUpdate(
                        { guildId: guild.id },
                        { $pull: { activeChannels: { channelId: oldState.channelId } } }
                    );
                }
            }
        }
    });

    // 3. Test Preview Command: §vc
    client.on('messageCreate', async (message) => {
        if (message.author.bot || !message.guild) return;

        if (message.content.trim() === '§vc') {
            const config = await TempVCConfig.findOne({ guildId: message.guild.id });
            if (!config || !config.hubVoiceChannelId) {
                return message.reply('⚠️ Please configure the Voice Generator using `/panel book:2 page:8` first!');
            }

            const activeCount = config.activeChannels ? config.activeChannels.length : 0;
            message.reply(`🎤 **[TEST PREVIEW] Voice Generator Status:**\nHub Channel: <#${config.hubVoiceChannelId}>\nTarget Category: <#${config.targetCategoryId}>\nActive Channels: **${activeCount}**`);
        }
    });

    console.log('✔ Temp VC handler loaded.');
};
