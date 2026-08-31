const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const GoodbyeConfig = require('../models/goodbye');

module.exports = (client) => {

    // 1. Open Goodbye Setup Modal
    client.on('interactionCreate', async (interaction) => {
        if (interaction.isButton() && interaction.customId === 'open_goodbye_modal') {
            const data = await GoodbyeConfig.findOne({ guildId: interaction.guild.id }) || {};

            const modal = new ModalBuilder()
                .setCustomId('goodbye_config_modal')
                .setTitle('Goodbye System Setup');

            const channelInput = new TextInputBuilder()
                .setCustomId('goodbye_channel_id')
                .setLabel('Goodbye Channel ID')
                .setPlaceholder('Enter channel ID where leave embed will be sent')
                .setStyle(TextInputStyle.Short)
                .setValue(data.channelId || '')
                .setRequired(true);

            const msgInput = new TextInputBuilder()
                .setCustomId('goodbye_message')
                .setLabel('Goodbye Message Template')
                .setPlaceholder('{user}, {username}, {members}, {server}')
                .setStyle(TextInputStyle.Paragraph)
                .setValue(data.message || 'Goodbye {user}, we will miss you! The server now has {members} members.')
                .setRequired(true);

            const colorInput = new TextInputBuilder()
                .setCustomId('goodbye_color')
                .setLabel('Embed Hex Color')
                .setPlaceholder('#ED4245')
                .setStyle(TextInputStyle.Short)
                .setValue(data.embedColor || '#ED4245')
                .setRequired(false);

            const imageInput = new TextInputBuilder()
                .setCustomId('goodbye_image')
                .setLabel('Banner / Image URL (Optional)')
                .setPlaceholder('https://example.com/banner.png')
                .setStyle(TextInputStyle.Short)
                .setValue(data.imageUrl || '')
                .setRequired(false);

            modal.addComponents(
                new ActionRowBuilder().addComponents(channelInput),
                new ActionRowBuilder().addComponents(msgInput),
                new ActionRowBuilder().addComponents(colorInput),
                new ActionRowBuilder().addComponents(imageInput)
            );

            await interaction.showModal(modal);
        }

        // 2. Save Goodbye Config
        if (interaction.isModalSubmit() && interaction.customId === 'goodbye_config_modal') {
            await interaction.deferReply({ ephemeral: true });

            const channelId = interaction.fields.getTextInputValue('goodbye_channel_id').trim();
            const message = interaction.fields.getTextInputValue('goodbye_message').trim();
            const embedColor = interaction.fields.getTextInputValue('goodbye_color').trim() || '#ED4245';
            const imageUrl = interaction.fields.getTextInputValue('goodbye_image').trim() || null;

            await GoodbyeConfig.findOneAndUpdate(
                { guildId: interaction.guild.id },
                { channelId, message, embedColor, imageUrl },
                { upsert: true, new: true }
            );

            await interaction.editReply({ content: '✅ Goodbye system successfully configured!' });
        }
    });

    // 3. Member Leave Event Trigger
    client.on('guildMemberRemove', async (member) => {
        const config = await GoodbyeConfig.findOne({ guildId: member.guild.id });
        if (!config || !config.channelId) return;

        const channel = member.guild.channels.cache.get(config.channelId);
        if (!channel) return;

        const formattedDesc = config.message
            .replace(/{user}/g, `<@${member.id}>`)
            .replace(/{username}/g, member.user.username)
            .replace(/{server}/g, member.guild.name)
            .replace(/{members}/g, member.guild.memberCount);

        const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle(`👋 Goodbye from ${member.guild.name}`)
            .setDescription(formattedDesc)
            .setThumbnail(member.user.displayAvatarURL())
            .setFooter({ text: `${member.guild.name} Member Count: ${member.guild.memberCount}`, iconURL: member.guild.iconURL() })
            .setTimestamp();

        if (config.imageUrl) {
            embed.setImage(config.imageUrl);
        }

        await channel.send({ embeds: [embed] }).catch(() => {});
    });

    // 4. Test Preview Command: §goodbye
    client.on('messageCreate', async (message) => {
        if (message.author.bot || !message.guild) return;

        if (message.content.trim() === '§goodbye') {
            const config = await GoodbyeConfig.findOne({ guildId: message.guild.id });
            if (!config || !config.channelId) {
                return message.reply('⚠️ Please configure the Goodbye system via `/panel book:3 page:12` first.');
            }

            const formattedDesc = config.message
                .replace(/{user}/g, `<@${message.author.id}>`)
                .replace(/{username}/g, message.author.username)
                .replace(/{server}/g, message.guild.name)
                .replace(/{members}/g, message.guild.memberCount);

            const embed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle(`👋 [TEST PREVIEW] Goodbye from ${message.guild.name}`)
                .setDescription(formattedDesc)
                .setThumbnail(message.author.displayAvatarURL())
                .setFooter({ text: `${message.guild.name} Member Count: ${message.guild.memberCount}`, iconURL: message.guild.iconURL() })
                .setTimestamp();

            if (config.imageUrl) {
                embed.setImage(config.imageUrl);
            }

            await message.reply({ embeds: [embed] });
        }
    });

    console.log('✔ Goodbye handler loaded.');
};
