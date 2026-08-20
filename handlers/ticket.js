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
    PermissionFlagsBits 
} = require('discord.js');
const TicketConfig = require('../models/ticket');

const DEFAULT_PANEL_DESC = '✦ SUPPORT CENTER ✦\n\nNeed help? Create a ticket and our staff will assist you.\n\n◆ General Support\n◆ Reports\n◆ Purchase\n◆ Partnership\n\n» Please select the correct category.\n» Do not create unnecessary tickets.';
const DEFAULT_TICKET_MSG = '✦ Your ticket has been created!\n\n◆ Please explain your issue clearly.\n◆ Provide any required details or proof.\n◆ Please wait patiently for a staff member to assist you.\n\n» Thank you for contacting support!';
const DEFAULT_CATS = '🎟️ General Support, 🚨 Reports, 💳 Purchase, 🤝 Partnership';

// Helper: Public Ticket Panel Embed & Select Menu
function createTicketPanel(config) {
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
        description: `Open a ticket for ${cat.substring(0, 50)}`
    }));

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('ticket_select_category')
        .setPlaceholder('Select a category to open ticket...')
        .addOptions(options.length > 0 ? options : [{ label: 'General Support', value: 'ticket_cat_0' }]);

    const row = new ActionRowBuilder().addComponents(selectMenu);
    return { embed, row };
}

module.exports = (client) => {

    client.on('interactionCreate', async (interaction) => {
        // 1. Modal Trigger (From /panel page:2)
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

            const idsInput = new TextInputBuilder()
                .setCustomId('ticket_ids')
                .setLabel('Ticket Role ID || Ticket Channel ID')
                .setPlaceholder('ROLE_ID || CHANNEL_ID')
                .setStyle(TextInputStyle.Short)
                .setValue(data.supportRoleId && data.panelChannelId ? `${data.supportRoleId} || ${data.panelChannelId}` : '')
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

        // 2. Handle Modal Submission
        if (interaction.isModalSubmit() && interaction.customId === 'ticket_config_modal') {
            const panelDescription = interaction.fields.getTextInputValue('ticket_panel_desc');
            const ticketMessage = interaction.fields.getTextInputValue('ticket_inside_msg');
            const rawIds = interaction.fields.getTextInputValue('ticket_ids');
            const bannerUrl = interaction.fields.getTextInputValue('ticket_banner');
            const categories = interaction.fields.getTextInputValue('ticket_categories');

            const splitIds = rawIds.split('||').map(s => s.trim());
            const supportRoleId = splitIds[0] || null;
            const panelChannelId = splitIds[1] || null;

            const config = await TicketConfig.findOneAndUpdate(
                { guildId: interaction.guild.id },
                { panelDescription, ticketMessage, supportRoleId, panelChannelId, bannerUrl, categories },
                { upsert: true, new: true }
            );

            if (panelChannelId) {
                const targetChannel = interaction.guild.channels.cache.get(panelChannelId);
                if (targetChannel) {
                    const { embed, row } = createTicketPanel(config);
                    await targetChannel.send({ embeds: [embed], components: [row] });
                }
            }

            await interaction.reply({ content: '✅ Ticket System successfully configure ho gaya aur panel send kar diya gaya!', ephemeral: true });
        }

        // 3. Handle Category Selection & Channel Creation (0001, 0002...)
        if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select_category') {
            await interaction.deferReply({ ephemeral: true });

            const config = await TicketConfig.findOne({ guildId: interaction.guild.id });
            if (!config) return interaction.editReply({ content: '⚠️ Ticket System configure nahi hai.' });

            // Increment Counter
            const updatedConfig = await TicketConfig.findOneAndUpdate(
                { guildId: interaction.guild.id },
                { $inc: { ticketCounter: 1 } },
                { new: true }
            );

            const countStr = String(updatedConfig.ticketCounter).padStart(4, '0');
            const selectedCategoryLabel = interaction.component.options.find(o => o.value === interaction.values[0])?.label || 'Support';

            // Setup Permissions
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

            // Create Channel
            const ticketChannel = await interaction.guild.channels.create({
                name: countStr,
                type: ChannelType.GuildText,
                permissionOverwrites: permissionOverwrites
            });

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
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('close_ticket')
                    .setLabel('Close Ticket')
                    .setStyle(ButtonStyle.Danger)
            );

            await ticketChannel.send({ 
                content: `<@${interaction.user.id}> ${config.supportRoleId ? `<@&${config.supportRoleId}>` : ''}`, 
                embeds: [ticketEmbed], 
                components: [actionRow] 
            });

            await interaction.editReply({ content: `✅ Aapka ticket create ho gaya hai: ${ticketChannel}` });
        }

        // 4. Handle Claim Button (✅-0001)
        if (interaction.isButton() && interaction.customId.startsWith('claim_ticket_')) {
            const config = await TicketConfig.findOne({ guildId: interaction.guild.id });
            const isStaff = config?.supportRoleId && interaction.member.roles.cache.has(config.supportRoleId);
            const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

            if (!isStaff && !isAdmin) {
                return interaction.reply({ content: '❌ Aapke paas is ticket ko claim karne ki permission nahi hai.', ephemeral: true });
            }

            const ticketNum = interaction.customId.replace('claim_ticket_', '');
            await interaction.channel.setName(`✅-${ticketNum}`);

            const claimEmbed = new EmbedBuilder()
                .setColor('#2ECC71')
                .setDescription(`✅ Ticket ko <@${interaction.user.id}> ne **Claim** kar liya hai!`);

            // Disable claim button
            const updatedRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('claimed_disabled')
                    .setLabel(`Claimed by ${interaction.user.username}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('close_ticket')
                    .setLabel('Close Ticket')
                    .setStyle(ButtonStyle.Danger)
            );

            await interaction.update({ components: [updatedRow] });
            await interaction.channel.send({ embeds: [claimEmbed] });
        }

        // 5. Handle Close Button
        if (interaction.isButton() && interaction.customId === 'close_ticket') {
            const config = await TicketConfig.findOne({ guildId: interaction.guild.id });
            const isStaff = config?.supportRoleId && interaction.member.roles.cache.has(config.supportRoleId);
            const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

            if (!isStaff && !isAdmin) {
                return interaction.reply({ content: '❌ Sirf Support Staff hi ticket close kar sakte hain.', ephemeral: true });
            }

            await interaction.reply({ content: '🔒 Ticket 5 seconds me delete ho jayega...' });
            setTimeout(() => {
                interaction.channel.delete().catch(() => {});
            }, 5000);
        }
    });

    // 6. Secret Test Command: §ticket
    client.on('messageCreate', async (message) => {
        if (message.author.bot || !message.guild) return;

        if (message.content.trim() === '§ticket') {
            const config = await TicketConfig.findOne({ guildId: message.guild.id }) || {};
            const { embed, row } = createTicketPanel(config);

            await message.reply({ 
                content: '**[TEST PREVIEW] Ticket Panel Preview:**', 
                embeds: [embed], 
                components: [row] 
            });
        }
    });

    console.log('✔ Ticket handler loaded.');
};
