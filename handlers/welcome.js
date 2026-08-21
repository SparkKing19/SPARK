const { 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder, 
    EmbedBuilder 
} = require('discord.js');
const WelcomeConfig = require('../models/welcome');

const DEFAULT_TITLE = '✦ WELCOME TO {server} ✦';
const DEFAULT_DESCRIPTION = '✦ Welcome, {user}!\n\n◆ You are our {memberCount}th member.\n◆ Joined: {joined}\n\n» Explore the server\n» Meet new people\n» Stay active & have fun\n» Follow the rules\n\n✦ Thank you for joining {server}!\n◆ We hope you enjoy your stay.';
const DEFAULT_DM = 'Hey {user}, thank you for joining {server}!';

// Helper: Dynamic Placeholders Replacement
function formatPlaceholders(text, member) {
    if (!text) return '';
    const accountCreatedTs = Math.floor(member.user.createdTimestamp / 1000);
    const joinedTs = Math.floor((member.joinedTimestamp || Date.now()) / 1000);

    return text
        .replace(/{user}/gi, `<@${member.id}>`)
        .replace(/{accountCreate}/gi, `<t:${accountCreatedTs}:R>`)
        .replace(/{joined}/gi, `<t:${joinedTs}:R>`)
        .replace(/{memberCount}/gi, member.guild.memberCount.toString())
        .replace(/{server}/gi, member.guild.name);
}

// Helper: Generate Welcome Embed & DM
function generateWelcomePayload(config, member) {
    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(formatPlaceholders(config.title || DEFAULT_TITLE, member))
        .setDescription(formatPlaceholders(config.description || DEFAULT_DESCRIPTION, member))
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setTimestamp();

    if (config.bannerUrl && config.bannerUrl.startsWith('http')) {
        embed.setImage(config.bannerUrl);
    }

    const dmEmbed = new EmbedBuilder()
        .setColor('#5865F2')
        .setDescription(formatPlaceholders(config.dmText || DEFAULT_DM, member));

    return { embed, dmEmbed };
}

module.exports = (client) => {

    // 1. Button & Modal Interaction
    client.on('interactionCreate', async (interaction) => {
        if (interaction.isButton() && interaction.customId === 'open_welcome_modal') {
            const data = await WelcomeConfig.findOne({ guildId: interaction.guild.id }) || {};

            const modal = new ModalBuilder()
                .setCustomId('welcome_config_modal')
                .setTitle('Welcome System Configuration');

            const titleInput = new TextInputBuilder()
                .setCustomId('title_input')
                .setLabel('Title')
                .setStyle(TextInputStyle.Short)
                .setValue(data.title || DEFAULT_TITLE)
                .setRequired(true);

            const descInput = new TextInputBuilder()
                .setCustomId('desc_input')
                .setLabel('Description')
                .setStyle(TextInputStyle.Paragraph)
                .setValue(data.description || DEFAULT_DESCRIPTION)
                .setRequired(true);

            const bannerInput = new TextInputBuilder()
                .setCustomId('banner_input')
                .setLabel('Banner URL (Direct Image Link)')
                .setStyle(TextInputStyle.Short)
                .setValue(data.bannerUrl || '')
                .setRequired(false);

            const channelInput = new TextInputBuilder()
                .setCustomId('channel_input')
                .setLabel('Welcome Channel ID')
                .setStyle(TextInputStyle.Short)
                .setValue(data.channelId || '')
                .setRequired(true);

            const dmInput = new TextInputBuilder()
                .setCustomId('dm_input')
                .setLabel('DM Text')
                .setStyle(TextInputStyle.Paragraph)
                .setValue(data.dmText || DEFAULT_DM)
                .setRequired(false);

            modal.addComponents(
                new ActionRowBuilder().addComponents(titleInput),
                new ActionRowBuilder().addComponents(descInput),
                new ActionRowBuilder().addComponents(bannerInput),
                new ActionRowBuilder().addComponents(channelInput),
                new ActionRowBuilder().addComponents(dmInput)
            );

            await interaction.showModal(modal);
        }

        if (interaction.isModalSubmit() && interaction.customId === 'welcome_config_modal') {
            const title = interaction.fields.getTextInputValue('title_input');
            const description = interaction.fields.getTextInputValue('desc_input');
            const bannerUrl = interaction.fields.getTextInputValue('banner_input');
            const channelId = interaction.fields.getTextInputValue('channel_input').trim();
            const dmText = interaction.fields.getTextInputValue('dm_input');

            await WelcomeConfig.findOneAndUpdate(
                { guildId: interaction.guild.id },
                { title, description, bannerUrl, channelId, dmText },
                { upsert: true, new: true }
            );

            await interaction.reply({ content: '✅ Welcome settings have been successfully saved!', ephemeral: true });
        }
    });

    // 2. Real Member Join Event
    client.on('guildMemberAdd', async (member) => {
        const config = await WelcomeConfig.findOne({ guildId: member.guild.id });
        if (!config || !config.channelId) return;

        const channel = member.guild.channels.cache.get(config.channelId);
        const { embed, dmEmbed } = generateWelcomePayload(config, member);

        if (channel) {
            channel.send({ embeds: [embed] }).catch(console.error);
        }

        if (config.dmText) {
            member.send({ embeds: [dmEmbed] }).catch(() => {});
        }
    });

    // 3. Secret Test Command (§welcome)
    client.on('messageCreate', async (message) => {
        if (message.author.bot || !message.guild) return;

        if (message.content.trim() === '§welcome') {
            const config = await WelcomeConfig.findOne({ guildId: message.guild.id });

            if (!config) {
                return message.reply('⚠️ Please configure settings using `/panel book:1 page:1` first!');
            }

            const { embed, dmEmbed } = generateWelcomePayload(config, message.member);

            await message.reply({ content: '**[TEST PREVIEW] Server Welcome:**', embeds: [embed] });
            
            if (config.dmText) {
                message.author.send({ embeds: [dmEmbed] })
                    .then(() => message.channel.send('✅ Test DM successfully sent!'))
                    .catch(() => message.channel.send('❌ Could not send test DM (User DMs are closed).'));
            }
        }
    });

    console.log('✔ Welcome handler loaded.');
};
