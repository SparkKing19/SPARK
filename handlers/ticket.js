const { 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder, 
    EmbedBuilder, 
    StringSelectMenuBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ChannelType, 
    PermissionFlagsBits,
    AttachmentBuilder
} = require('discord.js');
const TicketConfig = require('../models/ticket');

const DEFAULT_PANEL_DESC = '✦ SUPPORT CENTER ✦\n\nNeed help? Create a ticket and our staff will assist you.\n\n◆ General Support\n◆ Reports\n◆ Purchase\n◆ Partnership\n\n» Please select the correct category.\n» Do not create unnecessary tickets.';
const DEFAULT_TICKET_MSG = '✦ Your ticket has been created!\n\n◆ Please explain your issue clearly.\n◆ Provide any required details or proof.\n◆ Please wait patiently for a staff member to assist you.\n\n» Thank you for contacting support!';
const DEFAULT_CATS = '🎟️ General Support, 🚨 Reports, 💳 Purchase, 🤝 Partnership';

// Helper: Public Ticket Panel Embed & Select Menu
function createTicketPanel(config, isTest = false) {
    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setDescription(config.panelDescription || DEFAULT_PANEL_DESC)
        .setTimestamp();

    if (config.bannerUrl && config.bannerUrl.startsWith('http')) {
        embed.setImage(config.bannerUrl);
    }

    const catArray = (config.categories || DEFAULT_CATS).split(',').map(c => c.trim()).filter(Boolean);
    const options = catArray.map((cat, idx) => ({
        label: cat.substring(0, 100),
        value: `ticket_cat_${idx}`,
        description: `Open ticket for ${cat.substring(0, 50)}`
    }));

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(isTest ? 'test_ticket_select' : 'ticket_select_category')
        .setPlaceholder(isTest ? '[DEMO] Select a category...' : 'Select a category to open ticket...')
        .addOptions(options.length > 0 ? options : [{ label: 'General Support', value: 'ticket_cat_0' }]);

    const row = new ActionRowBuilder().addComponents(selectMenu);
    return { embed, row };
}

module.exports = (client) => {

    client.on('interactionCreate', async (interaction) => {
        // 1. Open Configuration Modal
        if (interaction.isButton() && interaction.customId === 'open_ticket_modal') {
            const data = await TicketConfig.findOne({ guildId: interaction.guild.id }) || {};

            const modal = new ModalBuilder()
                .setCustomId('ticket_config_modal')
                .setTitle('Ticket System Configuration');

            const descInput = new TextInputBuilder()
                .setCustomId('ticket_panel_desc')
                .setLabel('Ticket Panel Description')
                .setStyle(TextInputStyle.Paragraph)
                .setValue(data.panelDescription || DEFAULT_PANEL_DESC)
                .setRequired(true);

            const msgInput = new TextInputBuilder()
                .setCustomId('ticket_inside_msg')
                .setLabel('Ticket Created Text')
                .setStyle(TextInputStyle.Paragraph)
                .setValue(data.ticketMessage || DEFAULT_TICKET_MSG)
                .setRequired(true);

            const idsValue = [data.supportRoleId, data.panelChannelId, data.categoryId, data.logsChannelId]
                .filter(Boolean)
                .join(' || ');

            const idsInput = new TextInputBuilder()
                .setCustomId('ticket_ids')
                .setLabel('Role || PanelCh || Category || LogsCh')
                .setPlaceholder('SUPPORT_ROLE || PANEL_CH || CATEGORY_ID || LOGS_CH')
                .setStyle(TextInputStyle.Short)
                .setValue(idsValue)
                .setRequired(true);

            const bannerInput = new TextInputBuilder()
                .setCustomId('ticket_banner')
                .setLabel('Banner URL')
                .setStyle(TextInputStyle.Short)
                .setValue(data.bannerUrl || '')
                .setRequired(false);

            const catInput = new TextInputBuilder()
                .setCustomId('ticket_categories')
                .setLabel('Categories (Comma Separated)')
                .setStyle(TextInputStyle.Paragraph)
                .setValue(data.categories || DEFAULT_CATS)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(descInput),
                new ActionRowBuilder().addComponents(msgInput),
                new ActionRowBuilder().addComponents(idsInput),
                new ActionRowBuilder().addComponents(bannerInput),
                new ActionRowBuilder().addComponents(catInput)
            );

            await interaction.showModal(modal);
        }

        // 2. Save Modal Configuration
        if (interaction.isModalSubmit() && interaction.customId === 'ticket_config_modal') {
            const panelDescription = interaction.fields.getTextInputValue('ticket_panel_desc');
            const ticketMessage = interaction.fields.getTextInputValue('ticket_inside_msg');
            const rawIds = interaction.fields.getTextInputValue('ticket_ids');
            const bannerUrl = interaction.fields.getTextInputValue('ticket_banner');
            const categories = interaction.fields.getTextInputValue('ticket_categories');

            const splitIds = rawIds.split('||').map(s => s.trim());
            const supportRoleId = splitIds[0] || null;
            const panelChannelId = splitIds[1] || null;
            const categoryId = splitIds[2] || null;
            const logsChannelId = splitIds[3] || null;

            const config = await TicketConfig.findOneAndUpdate(
                { guildId: interaction.guild.id },
                { panelDescription, ticketMessage, supportRoleId, panelChannelId, categoryId, logsChannelId, bannerUrl, categories },
                { upsert: true, new: true }
            );

            if (panelChannelId) {
                const targetChannel = interaction.guild.channels.cache.get(panelChannelId);
                if (targetChannel) {
                    const { embed, row } = createTicketPanel(config, false);
                    await targetChannel.send({ embeds: [embed], components: [row] });
                }
            }

            await interaction.reply({ content: '✅ Ticket System successfully configured!', ephemeral: true });
        }

        // 3. Demo / Test Selection Handling (No Ticket Created)
        if (interaction.isStringSelectMenu() && interaction.customId === 'test_ticket_select') {
            return interaction.reply({ 
                content: '⚠️ **[DEMO PREVIEW]** This is only a preview. To create an actual ticket, please use the panel sent in the configured setup channel.', 
                ephemeral: true 
            });
        }

        // 4. Real Ticket Creation
        if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select_category') {
            await interaction.deferReply({ ephemeral: true });

            const config = await TicketConfig.findOne({ guildId: interaction.guild.id });
            if (!config) return interaction.editReply({ content: '⚠️ Ticket System is not configured yet.' });

            // 1 User = 1 Ticket Check
            const existingTicket = config.activeTickets?.find(t => t.userId === interaction.user.id);
            if (existingTicket) {
                const checkChannel = interaction.guild.channels.cache.get(existingTicket.channelId);
                if (checkChannel) {
                    return interaction.editReply({ 
                        content: `❌ You already have an open ticket: <#${existingTicket.channelId}>. You can only create one ticket at a time.` 
                    });
                } else {
                    await TicketConfig.findOneAndUpdate(
                        { guildId: interaction.guild.id },
                        { $pull: { activeTickets: { channelId: existingTicket.channelId } } }
                    );
                }
            }

            // Increment Counter
            const updatedConfig = await TicketConfig.findOneAndUpdate(
                { guildId: interaction.guild.id },
                { $inc: { ticketCounter: 1 } },
                { new: true }
            );

            const countStr = String(updatedConfig.ticketCounter).padStart(4, '0');
            const selectedCategoryLabel = interaction.component.options.find(o => o.value === interaction.values[0])?.label || 'Support';

            const permissionOverwrites = [
                {
                    id: interaction.guild.roles.everyone.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: interaction.user.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles]
                },
                {
                    id: client.user.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels]
                }
            ];

            if (config.supportRoleId && interaction.guild.roles.cache.has(config.supportRoleId)) {
                permissionOverwrites.push({
                    id: config.supportRoleId,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
                });
            }

            const ticketChannel = await interaction.guild.channels.create({
                name: countStr,
                type: ChannelType.GuildText,
                parent: config.categoryId && interaction.guild.channels.cache.has(config.categoryId) ? config.categoryId : null,
                permissionOverwrites: permissionOverwrites
            });

            await TicketConfig.findOneAndUpdate(
                { guildId: interaction.guild.id },
                { $push: { activeTickets: { userId: interaction.user.id, channelId: ticketChannel.id, ticketNumber: countStr } } }
            );

            const ticketEmbed = new EmbedBuilder()
                .setColor('#00FFAA')
                .setTitle(`Ticket #${countStr} - ${selectedCategoryLabel}`)
                .setDescription(config.ticketMessage || DEFAULT_TICKET_MSG)
                .setFooter({ text: `Created by ${interaction.user.tag}` })
                .setTimestamp();

            const actionRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`claim_ticket_${countStr}`)
                    .setLabel('Claim Ticket')
                    .setEmoji('<a:CONFIRM:1540171582817968148>')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('close_ticket')
                    .setLabel('Close Ticket')
                    .setEmoji('<a:ALERT:1540171495022530701>')
                    .setStyle(ButtonStyle.Danger)
            );

            await ticketChannel.send({ 
                content: `<@${interaction.user.id}> ${config.supportRoleId ? `<@&${config.supportRoleId}>` : ''}`, 
                embeds: [ticketEmbed], 
                components: [actionRow] 
            });

            await interaction.editReply({ content: `✅ Your ticket has been created: ${ticketChannel}` });
        }

        // 5. Handle Claim Button
        if (interaction.isButton() && interaction.customId.startsWith('claim_ticket_')) {
            const config = await TicketConfig.findOne({ guildId: interaction.guild.id });
            const isStaff = config?.supportRoleId && interaction.member.roles.cache.has(config.supportRoleId);
            const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

            if (!isStaff && !isAdmin) {
                return interaction.reply({ content: '❌ You do not have permission to claim this ticket.', ephemeral: true });
            }

            const ticketNum = interaction.customId.replace('claim_ticket_', '');
            await interaction.channel.setName(`✅-${ticketNum}`);

            const claimEmbed = new EmbedBuilder()
                .setColor('#2ECC71')
                .setDescription(`✅ Ticket has been **Claimed** by <@${interaction.user.id}>!`);

            const updatedRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('claimed_disabled')
                    .setLabel(`Claimed by ${interaction.user.username}`)
                    .setEmoji('<a:CONFIRM:1540171582817968148>')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('close_ticket')
                    .setLabel('Close Ticket')
                    .setEmoji('<a:ALERT:1540171495022530701>')
                    .setStyle(ButtonStyle.Danger)
            );

            await interaction.update({ components: [updatedRow] });
            await interaction.channel.send({ embeds: [claimEmbed] });
        }

        // 6. Handle Close Button with Full Chat Transcript
        if (interaction.isButton() && interaction.customId === 'close_ticket') {
            const config = await TicketConfig.findOne({ guildId: interaction.guild.id });
            const isStaff = config?.supportRoleId && interaction.member.roles.cache.has(config.supportRoleId);
            const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

            if (!isStaff && !isAdmin) {
                return interaction.reply({ content: '❌ Only Support Staff can close this ticket.', ephemeral: true });
            }

            const ticketData = config.activeTickets?.find(t => t.channelId === interaction.channel.id);

            await interaction.reply({ content: '🔒 Saving transcript and deleting ticket in 5 seconds...' });

            // Generate Full Chat Transcript
            if (config.logsChannelId) {
                const logsChannel = interaction.guild.channels.cache.get(config.logsChannelId);
                if (logsChannel) {
                    const fetchedMessages = await interaction.channel.messages.fetch({ limit: 100 });
                    const sortedMessages = Array.from(fetchedMessages.values()).reverse();

                    let transcriptText = `=========================================\n`;
                    transcriptText += `TRANSCRIPT FOR TICKET #${ticketData?.ticketNumber || interaction.channel.name}\n`;
                    transcriptText += `Guild: ${interaction.guild.name} (${interaction.guild.id})\n`;
                    transcriptText += `Opened By: ${ticketData ? ticketData.userId : 'Unknown'}\n`;
                    transcriptText += `Closed By: ${interaction.user.tag} (${interaction.user.id})\n`;
                    transcriptText += `Date: ${new Date().toUTCString()}\n`;
                    transcriptText += `=========================================\n\n`;

                    for (const msg of sortedMessages) {
                        const time = msg.createdAt.toISOString().replace(/T/, ' ').replace(/\..+/, '');
                        const content = msg.cleanContent || (msg.embeds.length > 0 ? '[Embed Message]' : '[No Text Content]');
                        const attachments = msg.attachments.map(a => `[Attachment: ${a.url}]`).join(' ');
                        transcriptText += `[${time}] ${msg.author.tag}: ${content} ${attachments}\n`;
                    }

                    const buffer = Buffer.from(transcriptText, 'utf-8');
                    const attachment = new AttachmentBuilder(buffer, { name: `transcript-${interaction.channel.name}.txt` });

                    const logEmbed = new EmbedBuilder()
                        .setColor('#ED4245')
                        .setTitle(`🗑️ Ticket Closed: #${ticketData?.ticketNumber || interaction.channel.name}`)
                        .addFields(
                            { name: '👤 Opened By', value: ticketData ? `<@${ticketData.userId}>` : 'Unknown', inline: true },
                            { name: '🛡️ Closed By', value: `<@${interaction.user.id}>`, inline: true },
                            { name: '📁 Channel Name', value: interaction.channel.name, inline: true }
                        )
                        .setTimestamp();

                    await logsChannel.send({ embeds: [logEmbed], files: [attachment] }).catch(console.error);
                }
            }

            // Remove from activeTickets array in DB
            await TicketConfig.findOneAndUpdate(
                { guildId: interaction.guild.id },
                { $pull: { activeTickets: { channelId: interaction.channel.id } } }
            );

            setTimeout(() => {
                interaction.channel.delete().catch(() => {});
            }, 5000);
        }
    });

    // 7. Test Preview (§ticket)
    client.on('messageCreate', async (message) => {
        if (message.author.bot || !message.guild) return;

        if (message.content.trim() === '§ticket') {
            const config = await TicketConfig.findOne({ guildId: message.guild.id }) || {};
            const { embed, row } = createTicketPanel(config, true);

            await message.reply({ 
                content: '**[TEST PREVIEW] Ticket Panel Preview (Ticket creation is disabled in preview):**', 
                embeds: [embed], 
                components: [row] 
            });
        }
    });

    console.log('✔ Ticket handler loaded.');
};
                
