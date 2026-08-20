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
const StoreConfig = require('../models/store');

function createStorePanel(config, isTest = false) {
    const embed = new EmbedBuilder()
        .setColor('#F1C40F')
        .setTitle('✦ OFFICIAL STORE ✦')
        .setDescription(config.panelDesc || 'Select an item from the menu below to place an order.')
        .setTimestamp();

    if (config.bannerUrl && config.bannerUrl.startsWith('http')) {
        embed.setImage(config.bannerUrl);
    }

    const options = (config.items && config.items.length > 0)
        ? config.items.map((item, idx) => ({
            label: `${item.name} (${item.price})`.substring(0, 100),
            value: `store_item_${idx}`,
            description: `Category: ${item.category}`.substring(0, 100)
        }))
        : [{ label: 'VIP Rank ($5.00)', value: 'store_item_0', description: 'Default Item' }];

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(isTest ? 'test_store_select' : 'store_select_item')
        .setPlaceholder(isTest ? '[DEMO] Select an item to preview...' : 'Choose an item to order...')
        .addOptions(options.slice(0, 25));

    const row = new ActionRowBuilder().addComponents(selectMenu);
    return { embed, row };
}

module.exports = (client) => {

    // 12-Hour Pending Orders Automated Reminder Interval
    setInterval(async () => {
        try {
            const configs = await StoreConfig.find({ 'pendingOrders.0': { $exists: true } });
            const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);

            for (const config of configs) {
                for (const order of config.pendingOrders) {
                    if (new Date(order.lastNotified) <= twelveHoursAgo) {
                        const user = await client.users.fetch(order.userId).catch(() => null);
                        if (user) {
                            const dmText = (config.pendingDm || '⏳ Hey {user}, your order for **{item}** is currently pending.')
                                .replace(/{user}/gi, `<@${order.userId}>`)
                                .replace(/{item}/gi, order.itemName)
                                .replace(/{price}/gi, order.price)
                                .replace(/{username}/gi, order.username);

                            const embed = new EmbedBuilder()
                                .setColor('#FFA500')
                                .setTitle('⏳ Order Pending Notice')
                                .setDescription(dmText)
                                .setTimestamp();

                            await user.send({ embeds: [embed] }).catch(() => {});
                        }

                        // Update lastNotified timestamp
                        await StoreConfig.updateOne(
                            { guildId: config.guildId, 'pendingOrders.orderNumber': order.orderNumber },
                            { $set: { 'pendingOrders.$.lastNotified': new Date() } }
                        );
                    }
                }
            }
        } catch (err) {
            console.error('Store reminder error:', err);
        }
    }, 60 * 60 * 1000); // Har ghante check karega

    client.on('interactionCreate', async (interaction) => {
        // 1. Open Setup Modal
        if (interaction.isButton() && interaction.customId === 'open_store_modal') {
            const data = await StoreConfig.findOne({ guildId: interaction.guild.id }) || {};

            const modal = new ModalBuilder()
                .setCustomId('store_config_modal')
                .setTitle('Store System Setup');

            const itemsInput = new TextInputBuilder()
                .setCustomId('store_items')
                .setLabel('Category, Item, Price (Sep by ||)')
                .setPlaceholder('Ranks, VIP, $5 || Items, Sword, $2 || Coins, 1000 Coins, $1')
                .setStyle(TextInputStyle.Paragraph)
                .setValue(data.rawItems || '')
                .setRequired(true);

            const idsInput = new TextInputBuilder()
                .setCustomId('store_ids')
                .setLabel('StoreRole, PanelCh, CategoryID, CmdsCh')
                .setPlaceholder('STORE_ROLE_ID, PANEL_CH_ID, CATEGORY_ID, CMDS_CH_ID')
                .setStyle(TextInputStyle.Short)
                .setValue(data.rawIds || '')
                .setRequired(true);

            const textsInput = new TextInputBuilder()
                .setCustomId('store_texts')
                .setLabel('Texts (Sep by ||)')
                .setPlaceholder('PanelDesc || OrderDesc || ApprovedDM || RejectedDM || PendingDM')
                .setStyle(TextInputStyle.Paragraph)
                .setValue(data.rawTexts || '')
                .setRequired(false);

            const cmdsInput = new TextInputBuilder()
                .setCustomId('store_cmds')
                .setLabel('Cmds: Item:Cmd (Sep by ||)')
                .setPlaceholder('VIP:lp user {username} parent set vip || Sword:give {username} diamond_sword 1')
                .setStyle(TextInputStyle.Paragraph)
                .setValue(data.rawCmds || '')
                .setRequired(false);

            const bannerInput = new TextInputBuilder()
                .setCustomId('store_banner')
                .setLabel('Banner URL')
                .setStyle(TextInputStyle.Short)
                .setValue(data.bannerUrl || '')
                .setRequired(false);

            modal.addComponents(
                new ActionRowBuilder().addComponents(itemsInput),
                new ActionRowBuilder().addComponents(idsInput),
                new ActionRowBuilder().addComponents(textsInput),
                new ActionRowBuilder().addComponents(cmdsInput),
                new ActionRowBuilder().addComponents(bannerInput)
            );

            await interaction.showModal(modal);
        }

        // 2. Save Modal Configuration
        if (interaction.isModalSubmit() && interaction.customId === 'store_config_modal') {
            await interaction.deferReply({ ephemeral: true });

            const rawItems = interaction.fields.getTextInputValue('store_items');
            const rawIds = interaction.fields.getTextInputValue('store_ids');
            const rawTexts = interaction.fields.getTextInputValue('store_texts');
            const rawCmds = interaction.fields.getTextInputValue('store_cmds');
            const bannerUrl = interaction.fields.getTextInputValue('store_banner');

            // Parse Items
            const items = rawItems.split('||').map(entry => {
                const parts = entry.split(',').map(p => p.trim());
                return { category: parts[0] || 'General', name: parts[1] || 'Item', price: parts[2] || '$0.00' };
            }).filter(i => i.name);

            // Parse IDs
            const idParts = rawIds.split(',').map(s => s.trim());
            const storeRoleId = idParts[0] || null;
            const panelChannelId = idParts[1] || null;
            const categoryId = idParts[2] || null;
            const cmdsChannelId = idParts[3] || null;

            // Parse Texts
            const textParts = rawTexts.split('||').map(s => s.trim());
            const panelDesc = textParts[0] || undefined;
            const orderDesc = textParts[1] || undefined;
            const approvedDm = textParts[2] || undefined;
            const rejectedDm = textParts[3] || undefined;
            const pendingDm = textParts[4] || undefined;

            // Parse Commands
            const commands = rawCmds.split('||').map(entry => {
                const parts = entry.split(':');
                return { itemName: parts[0]?.trim(), command: parts.slice(1).join(':').trim() };
            }).filter(c => c.itemName && c.command);

            const config = await StoreConfig.findOneAndUpdate(
                { guildId: interaction.guild.id },
                { 
                    rawItems, rawIds, rawTexts, rawCmds, bannerUrl,
                    storeRoleId, panelChannelId, categoryId, cmdsChannelId,
                    items, commands,
                    ...(panelDesc && { panelDesc }),
                    ...(orderDesc && { orderDesc }),
                    ...(approvedDm && { approvedDm }),
                    ...(rejectedDm && { rejectedDm }),
                    ...(pendingDm && { pendingDm })
                },
                { upsert: true, new: true }
            );

            if (panelChannelId) {
                const targetChannel = interaction.guild.channels.cache.get(panelChannelId);
                if (targetChannel) {
                    const { embed, row } = createStorePanel(config, false);
                    await targetChannel.send({ embeds: [embed], components: [row] }).catch(() => {});
                }
            }

            await interaction.editReply({ content: '✅ Store System successfully configure ho gaya aur panel send kar diya gaya!' });
        }

        // 3. Demo Store Select (Test Only)
        if (interaction.isStringSelectMenu() && interaction.customId === 'test_store_select') {
            return interaction.reply({ 
                content: '⚠️ **[DEMO PREVIEW]** Ye sirf test preview hai. Real order panel channel me ja kar karein.', 
                ephemeral: true 
            });
        }

        // 4. Real Item Selection -> Send Ephemeral Order Now Button
        if (interaction.isStringSelectMenu() && interaction.customId === 'store_select_item') {
            const config = await StoreConfig.findOne({ guildId: interaction.guild.id });
            if (!config) return interaction.reply({ content: '⚠️ Store system configure nahi hai.', ephemeral: true });

            const itemIndex = parseInt(interaction.values[0].replace('store_item_', ''), 10);
            const selectedItem = config.items[itemIndex] || config.items[0];

            if (!selectedItem) return interaction.reply({ content: '❌ Item not found.', ephemeral: true });

            const previewEmbed = new EmbedBuilder()
                .setColor('#F1C40F')
                .setTitle(`🛒 Selected: ${selectedItem.name}`)
                .addFields(
                    { name: 'Category', value: selectedItem.category, inline: true },
                    { name: 'Price', value: selectedItem.price, inline: true }
                )
                .setDescription('Order place karne ke liye niche diye gaye **Order Now** button par click karein.')
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`store_ordernow_${itemIndex}`)
                    .setLabel('Order Now')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🛍️')
            );

            await interaction.reply({ embeds: [previewEmbed], components: [row], ephemeral: true });
        }

        // 5. Order Now Clicked -> Open IGN Popup Modal
        if (interaction.isButton() && interaction.customId.startsWith('store_ordernow_')) {
            const itemIndex = interaction.customId.replace('store_ordernow_', '');

            const modal = new ModalBuilder()
                .setCustomId(`store_ign_modal_${itemIndex}`)
                .setTitle('In-Game Username Required');

            const ignInput = new TextInputBuilder()
                .setCustomId('store_ign_input')
                .setLabel('Enter In-Game Username (IGN)')
                .setPlaceholder('e.g. ProGamer_123')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(ignInput));
            await interaction.showModal(modal);
        }

        // 6. IGN Modal Submit -> Create `order-0001` Channel
        if (interaction.isModalSubmit() && interaction.customId.startsWith('store_ign_modal_')) {
            await interaction.deferReply({ ephemeral: true });

            const itemIndex = parseInt(interaction.customId.replace('store_ign_modal_', ''), 10);
            const inGameUsername = interaction.fields.getTextInputValue('store_ign_input').trim();

            const config = await StoreConfig.findOne({ guildId: interaction.guild.id });
            if (!config) return interaction.editReply({ content: '⚠️ Store configure nahi hai.' });

            const selectedItem = config.items[itemIndex] || { name: 'Item', price: '$0.00' };

            // Increment Order Counter
            const updatedConfig = await StoreConfig.findOneAndUpdate(
                { guildId: interaction.guild.id },
                { $inc: { orderCounter: 1 } },
                { new: true }
            );

            const countStr = String(updatedConfig.orderCounter).padStart(4, '0');
            const channelName = `order-${countStr}`;

            // Permissions
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

            if (config.storeRoleId && interaction.guild.roles.cache.has(config.storeRoleId)) {
                permissionOverwrites.push({
                    id: config.storeRoleId,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
                });
            }

            // Create Order Channel
            const orderChannel = await interaction.guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: config.categoryId && interaction.guild.channels.cache.has(config.categoryId) ? config.categoryId : null,
                permissionOverwrites: permissionOverwrites
            });

            // Push to Pending Orders in DB
            await StoreConfig.findOneAndUpdate(
                { guildId: interaction.guild.id },
                { 
                    $push: { 
                        pendingOrders: {
                            orderNumber: countStr,
                            userId: interaction.user.id,
                            username: inGameUsername,
                            itemName: selectedItem.name,
                            price: selectedItem.price,
                            channelId: orderChannel.id,
                            createdAt: new Date(),
                            lastNotified: new Date()
                        }
                    }
                }
            );

            const orderText = (config.orderDesc || '✦ NEW ORDER RECEIVED ✦\n\n◆ **Item:** {item}\n◆ **Price:** {price}\n◆ **IGN:** {username}\n◆ **Buyer:** {user}')
                .replace(/{item}/gi, selectedItem.name)
                .replace(/{price}/gi, selectedItem.price)
                .replace(/{username}/gi, inGameUsername)
                .replace(/{user}/gi, `<@${interaction.user.id}>`);

            const orderEmbed = new EmbedBuilder()
                .setColor('#2ECC71')
                .setTitle(`🛍️ Order #${countStr}`)
                .setDescription(orderText)
                .setFooter({ text: `Buyer: ${interaction.user.tag}` })
                .setTimestamp();

            const actionRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`order_approve_${countStr}`)
                    .setLabel('Approve')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('✅'),
                new ButtonBuilder()
                    .setCustomId(`order_reject_${countStr}`)
                    .setLabel('Reject')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('❌')
            );

            await orderChannel.send({
                content: `<@${interaction.user.id}> ${config.storeRoleId ? `<@&${config.storeRoleId}>` : ''}`,
                embeds: [orderEmbed],
                components: [actionRow]
            });

            await interaction.editReply({ content: `✅ Order channel create ho gaya hai: ${orderChannel}` });
        }

        // 7. Handle Approve Button (Commands Execution & DM)
        if (interaction.isButton() && interaction.customId.startsWith('order_approve_')) {
            const orderNum = interaction.customId.replace('order_approve_', '');
            const config = await StoreConfig.findOne({ guildId: interaction.guild.id });

            const isStaff = config?.storeRoleId && interaction.member.roles.cache.has(config.storeRoleId);
            const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

            if (!isStaff && !isAdmin) {
                return interaction.reply({ content: '❌ Sirf Store Staff hi orders approve kar sakte hain.', ephemeral: true });
            }

            const orderData = config.pendingOrders?.find(o => o.orderNumber === orderNum);
            if (!orderData) {
                return interaction.reply({ content: '⚠️ Order details database me nahi mili.', ephemeral: true });
            }

            await interaction.reply({ content: '✅ Order APPROVE ho gaya! Commands dispatch ho rahi hain aur channel 5s me delete ho raha hai...' });

            // Run & Send In-Game Command to Cmds Channel
            const matchingCmd = config.commands?.find(c => c.itemName.toLowerCase() === orderData.itemName.toLowerCase());
            if (matchingCmd && config.cmdsChannelId) {
                const cmdsChannel = interaction.guild.channels.cache.get(config.cmdsChannelId);
                if (cmdsChannel) {
                    const finalCmd = matchingCmd.command.replace(/{username}/gi, orderData.username);
                    await cmdsChannel.send(finalCmd).catch(console.error);
                }
            }

            // Send Approved DM to Buyer
            const buyer = await client.users.fetch(orderData.userId).catch(() => null);
            if (buyer) {
                const dmMessage = (config.approvedDm || '✅ Hey {user}, your order for **{item}** has been APPROVED!')
                    .replace(/{user}/gi, `<@${orderData.userId}>`)
                    .replace(/{item}/gi, orderData.itemName)
                    .replace(/{price}/gi, orderData.price)
                    .replace(/{username}/gi, orderData.username);

                const embed = new EmbedBuilder()
                    .setColor('#2ECC71')
                    .setTitle('🎉 Order Approved!')
                    .setDescription(dmMessage)
                    .setTimestamp();

                await buyer.send({ embeds: [embed] }).catch(() => {});
            }

            // Remove from DB Pending List
            await StoreConfig.findOneAndUpdate(
                { guildId: interaction.guild.id },
                { $pull: { pendingOrders: { orderNumber: orderNum } } }
            );

            setTimeout(() => {
                interaction.channel.delete().catch(() => {});
            }, 5000);
        }

        // 8. Handle Reject Button
        if (interaction.isButton() && interaction.customId.startsWith('order_reject_')) {
            const orderNum = interaction.customId.replace('order_reject_', '');
            const config = await StoreConfig.findOne({ guildId: interaction.guild.id });

            const isStaff = config?.storeRoleId && interaction.member.roles.cache.has(config.storeRoleId);
            const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

            if (!isStaff && !isAdmin) {
                return interaction.reply({ content: '❌ Sirf Store Staff hi orders reject kar sakte hain.', ephemeral: true });
            }

            const orderData = config.pendingOrders?.find(o => o.orderNumber === orderNum);
            if (!orderData) {
                return interaction.reply({ content: '⚠️ Order details database me nahi mili.', ephemeral: true });
            }

            await interaction.reply({ content: '❌ Order REJECT ho gaya! User ko DM send kiya ja raha hai aur channel 5s me delete hoga...' });

            // Send Rejected DM to Buyer
            const buyer = await client.users.fetch(orderData.userId).catch(() => null);
            if (buyer) {
                const dmMessage = (config.rejectedDm || '❌ Hey {user}, your order for **{item}** was REJECTED.')
                    .replace(/{user}/gi, `<@${orderData.userId}>`)
                    .replace(/{item}/gi, orderData.itemName)
                    .replace(/{price}/gi, orderData.price)
                    .replace(/{username}/gi, orderData.username);

                const embed = new EmbedBuilder()
                    .setColor('#ED4245')
                    .setTitle('❌ Order Rejected')
                    .setDescription(dmMessage)
                    .setTimestamp();

                await buyer.send({ embeds: [embed] }).catch(() => {});
            }

            // Remove from DB Pending List
            await StoreConfig.findOneAndUpdate(
                { guildId: interaction.guild.id },
                { $pull: { pendingOrders: { orderNumber: orderNum } } }
            );

            setTimeout(() => {
                interaction.channel.delete().catch(() => {});
            }, 5000);
        }
    });

    // 9. Secret Test Command: §store
    client.on('messageCreate', async (message) => {
        if (message.author.bot || !message.guild) return;

        if (message.content.trim() === '§store') {
            const config = await StoreConfig.findOne({ guildId: message.guild.id }) || {};
            const { embed, row } = createStorePanel(config, true);

            await message.reply({ 
                content: '**[TEST PREVIEW] Store Panel Preview (Isme order create nahi hoga):**', 
                embeds: [embed], 
                components: [row] 
            });
        }
    });

    console.log('✔ Store handler loaded.');
};
