const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ChannelType, 
    PermissionFlagsBits 
} = require('discord.js');
const { isNormalFeatureEnabled } = require('../utils/featureCheck');

module.exports = (client) => {
    // 1. One-Command Setup
    // Format: !set-ticket <panel_channel> <category> <logs_channel> <staff_role>
    client.on('messageCreate', async (message) => {
        if (!message.guild || message.author.bot) return;

        const args = message.content.trim().split(/ +/);
        if (args[0]?.toLowerCase() !== '!set-ticket') return;

        if (message.guild && !(await isNormalFeatureEnabled(message.guild.id))) return;
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('❌ Administrator permission required.');
        }

        const rawPanel = args[1]?.replace(/[<#>]/g, '');
        const rawCategory = args[2]?.replace(/[<#>]/g, '');
        const rawLogs = args[3]?.replace(/[<#>]/g, '');
        const rawRole = args[4]?.replace(/[<@&>]/g, '');

        if (!rawPanel || !rawCategory || !rawLogs || !rawRole) {
            return message.reply('❌ **Usage:** `!set-ticket <panel_channel_id> <category_id> <logs_channel_id> <staff_role_id>`');
        }

        const panelChannel = message.guild.channels.cache.get(rawPanel);
        const categoryChannel = message.guild.channels.cache.get(rawCategory);
        const logsChannel = message.guild.channels.cache.get(rawLogs);
        const staffRole = message.guild.roles.cache.get(rawRole);

        if (!panelChannel || !panelChannel.isTextBased()) {
            return message.reply('❌ Invalid Panel Channel ID.');
        }
        if (!categoryChannel || categoryChannel.type !== ChannelType.GuildCategory) {
            return message.reply('❌ Invalid Category ID (Must be a Category).');
        }
        if (!logsChannel || !logsChannel.isTextBased()) {
            return message.reply('❌ Invalid Logs Channel ID.');
        }
        if (!staffRole) {
            return message.reply('❌ Invalid Staff Role ID.');
        }

        // Store configuration metadata inside Panel Channel Topic
        const configData = `spark_tcfg:${categoryChannel.id}:${logsChannel.id}:${staffRole.id}`;
        await panelChannel.setTopic(configData).catch(() => {});

        // Panel Embed: Server Name Title + Ticket Image
        const panelEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle(`🎫 ${message.guild.name} Support System`)
            .setDescription(
                `Welcome to **${message.guild.name}** Support Desk!\n\n` +
                `Need help, inquiry, or partnership?\n` +
                `Click the **Create Ticket** button below to open a private conversation with our staff team.`
            )
            .setImage('https://images.unsplash.com/photo-1534536281715-e28d76689b4d?w=1000&q=80')
            .setFooter({ text: `${message.guild.name} • 1 Ticket Per User Limit` });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('normal_open_ticket')
                .setLabel('Create Ticket')
                .setEmoji('📩')
                .setStyle(ButtonStyle.Primary)
        );

        await panelChannel.send({ embeds: [panelEmbed], components: [row] });
        await message.reply(`✅ **Ticket System Initialized in <#${panelChannel.id}>!**`);
    });

    // 2. Interactive Handlers (Open, Claim, Close)
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isButton() || !interaction.guild) return;
        if (!(await isNormalFeatureEnabled(interaction.guildId))) return;

        // A. CREATE TICKET
        if (interaction.customId === 'normal_open_ticket') {
            const panelChannel = interaction.channel;
            const topic = panelChannel.topic || '';
            const match = topic.match(/spark_tcfg:(\d+):(\d+):(\d+)/);

            if (!match) {
                return interaction.reply({ 
                    content: '❌ Ticket configuration not found on this channel. Please re-run `!set-ticket`.', 
                    ephemeral: true 
                });
            }

            const [_, categoryId, logsId, staffRoleId] = match;

            // 1 Ticket Per User Restriction
            const existing = interaction.guild.channels.cache.find(c => 
                c.topic && c.topic.startsWith(`spark_ticket_user:${interaction.user.id}`)
            );
            if (existing) {
                return interaction.reply({ 
                    content: `❌ You already have an active ticket open in <#${existing.id}>. Only 1 ticket allowed at a time.`, 
                    ephemeral: true 
                });
            }

            await interaction.deferReply({ ephemeral: true });

            try {
                // Channel Topic packs metadata: user_id, logs_id, staff_role_id
                const ticketTopic = `spark_ticket_user:${interaction.user.id}:${logsId}:${staffRoleId}`;

                const ticketChannel = await interaction.guild.channels.create({
                    name: `ticket-${interaction.user.username.toLowerCase()}`,
                    type: ChannelType.GuildText,
                    parent: categoryId,
                    topic: ticketTopic,
                    permissionOverwrites: [
                        { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                        { 
                            id: interaction.user.id, 
                            allow: [
                                PermissionFlagsBits.ViewChannel, 
                                PermissionFlagsBits.SendMessages, 
                                PermissionFlagsBits.AttachFiles, 
                                PermissionFlagsBits.ReadMessageHistory
                            ] 
                        },
                        { 
                            id: staffRoleId, 
                            allow: [
                                PermissionFlagsBits.ViewChannel, 
                                PermissionFlagsBits.SendMessages, 
                                PermissionFlagsBits.AttachFiles, 
                                PermissionFlagsBits.ReadMessageHistory
                            ] 
                        },
                        { 
                            id: interaction.guild.members.me.id, 
                            allow: [
                                PermissionFlagsBits.ViewChannel, 
                                PermissionFlagsBits.SendMessages, 
                                PermissionFlagsBits.ManageChannels
                            ] 
                        }
                    ]
                });

                const insideEmbed = new EmbedBuilder()
                    .setColor('#2ECC71')
                    .setTitle(`🎫 Ticket: ${interaction.user.username}`)
                    .setDescription(
                        `Hello <@${interaction.user.id}>, thank you for reaching out.\n` +
                        `Our <@&${staffRoleId}> staff team will attend to you shortly.\n\n` +
                        `• **Claim:** Staff can claim this ticket.\n` +
                        `• **Close:** Terminate this session.`
                    )
                    .setFooter({ text: 'SparkCore Ticket Engine' });

                const actionRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('normal_claim_ticket')
                        .setLabel('Claim Ticket')
                        .setEmoji('🙋‍♂️')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('normal_close_ticket')
                        .setLabel('Close Ticket')
                        .setEmoji('🔒')
                        .setStyle(ButtonStyle.Danger)
                );

                await ticketChannel.send({ 
                    content: `<@${interaction.user.id}> \vert{} <@&${staffRoleId}>`, 
                    embeds: [insideEmbed], 
                    components: [actionRow] 
                });

                // Dispatch Opened Log
                const logsChannel = interaction.guild.channels.cache.get(logsId);
                if (logsChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setColor('#2ECC71')
                        .setTitle('📩 Ticket Created')
                        .addFields(
                            { name: 'Author', value: `${interaction.user.tag} (\`${interaction.user.id}\`)`, inline: true },
                            { name: 'Channel', value: `<#${ticketChannel.id}>`, inline: true }
                        )
                        .setTimestamp();
                    await logsChannel.send({ embeds: [logEmbed] }).catch(() => {});
                }

                return interaction.editReply(`✅ Your ticket has been created: <#${ticketChannel.id}>`);
            } catch (err) {
                console.error('Ticket creation error:', err);
                return interaction.editReply(`❌ Failed to create ticket channel: \`${err.message}\``);
            }
        }

        // B. CLAIM TICKET
        if (interaction.customId === 'normal_claim_ticket') {
            const topic = interaction.channel.topic || '';
            const match = topic.match(/spark_ticket_user:(\d+):(\d+):(\d+)/);
            if (!match) return;

            const [_, authorId, logsId, staffRoleId] = match;

            const isStaff = interaction.member.roles.cache.has(staffRoleId) || 
                            interaction.member.permissions.has(PermissionFlagsBits.Administrator);

            if (!isStaff) {
                return interaction.reply({ content: '❌ Only staff members can claim this ticket.', ephemeral: true });
            }

            const updatedRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('normal_claimed_disabled')
                    .setLabel(`Claimed by ${interaction.user.username}`)
                    .setEmoji('✅')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('normal_close_ticket')
                    .setLabel('Close Ticket')
                    .setEmoji('🔒')
                    .setStyle(ButtonStyle.Danger)
            );

            await interaction.update({ components: [updatedRow] });
            await interaction.channel.send(`🙋‍♂️ <@${interaction.user.id}> has claimed this ticket and will be handling your request.`);

            // Log Claim
            const logsChannel = interaction.guild.channels.cache.get(logsId);
            if (logsChannel) {
                const logEmbed = new EmbedBuilder()
                    .setColor('#F1C40F')
                    .setTitle('🙋‍♂️ Ticket Claimed')
                    .addFields(
                        { name: 'Ticket Channel', value: `<#${interaction.channel.id}>`, inline: true },
                        { name: 'Staff Member', value: `${interaction.user.tag} (\`${interaction.user.id}\`)`, inline: true }
                    )
                    .setTimestamp();
                await logsChannel.send({ embeds: [logEmbed] }).catch(() => {});
            }
        }

        // C. CLOSE TICKET
        if (interaction.customId === 'normal_close_ticket') {
            const topic = interaction.channel.topic || '';
            const match = topic.match(/spark_ticket_user:(\d+):(\d+):(\d+)/);

            await interaction.reply('🔒 Terminating ticket in 5 seconds...');

            if (match) {
                const [_, authorId, logsId] = match;
                const logsChannel = interaction.guild.channels.cache.get(logsId);
                if (logsChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setColor('#E74C3C')
                        .setTitle('🔒 Ticket Closed')
                        .addFields(
                            { name: 'Channel Closed', value: `\`${interaction.channel.name}\``, inline: true },
                            { name: 'Closed By', value: `${interaction.user.tag} (\`${interaction.user.id}\`)`, inline: true }
                        )
                        .setTimestamp();
                    await logsChannel.send({ embeds: [logEmbed] }).catch(() => {});
                }
            }

            setTimeout(() => {
                interaction.channel.delete().catch(() => {});
            }, 5000);
        }
    });
};
                            
