const { 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder, 
    EmbedBuilder 
} = require('discord.js');
const WelcomeConfig = require('../models/welcome');

// Helper: Placeholders format karne ke liye
function formatPlaceholders(text, member) {
    if (!text) return '';
    const accountCreatedTs = Math.floor(member.user.createdTimestamp / 1000);
    const joinedTs = Math.floor((member.joinedTimestamp || Date.now()) / 1000);

    return text
        .replace(/{user}/g, `<@${member.id}>`)
        .replace(/{accountCreate}/g, `<t:${accountCreatedTs}:R>`)
        .replace(/{joined}/g, `<t:${joinedTs}:R>`)
        .replace(/{memberCount}/g, member.guild.memberCount.toString())
        .replace(/{server}/g, member.guild.name);
}

// Helper: Embed payload create karne ke liye
function generateWelcomePayload(config, member) {
    const embed = new EmbedBuilder()
        .setColor('#00FFAA')
        .setTitle(formatPlaceholders(config.title, member))
        .setDescription(formatPlaceholders(config.description, member))
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setTimestamp();

    if (config.bannerUrl && config.bannerUrl.startsWith('http')) {
        embed.setImage(config.bannerUrl);
    }

    const dmEmbed = new EmbedBuilder()
        .setColor('#5865F2')
        .setDescription(formatPlaceholders(config.dmText, member));

    return { embed, dmEmbed };
}

module.exports = (client) => {

    // 1. Button aur Modal Interactions
    client.on('interactionCreate', async (interaction) => {
        // Modal Open karna
        if (interaction.isButton() && interaction.customId === 'open_welcome_modal') {
            const data = await WelcomeConfig.findOne({ guildId: interaction.guild.id }) || {};

            const modal = new ModalBuilder()
                .setCustomId('welcome_config_modal')
                .setTitle('Welcome System Configuration');

            const titleInput = new TextInputBuilder()
                .setCustomId('title_input')
                .setLabel('Title')
                .setStyle(TextInputStyle.Short)
                .setValue(data.title || 'Welcome to {server}!')
                .setRequired(true);

            const descInput = new TextInputBuilder()
                .setCustomId('desc_input')
                .setLabel('Description')
                .setStyle(TextInputStyle.Paragraph)
                .setValue(data.description || 'Hey {user}, welcome to {server}!\n📅 Account: {accountCreate}\n📥 Joined: {joined}\n👥 Count: #{memberCount}')
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
                .setValue(data.dmText || 'Hey {user}, thank you for joining {server}!')
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

        // Modal Form Submit handle karna
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

            await interaction.reply({ content: '✅ Welcome settings successfully save ho gayi hain!', ephemeral: true });
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
                return message.reply('⚠️ Pehle `/panel page:1` run karke settings save karein!');
            }

            const { embed, dmEmbed } = generateWelcomePayload(config, message.member);

            await message.reply({ content: '**[TEST PREVIEW] Server Welcome:**', embeds: [embed] });
            
            if (config.dmText) {
                message.author.send({ embeds: [dmEmbed])
                    .then(() => message.channel.send('✅ Test DM successfully sent!'))
                    .catch(() => message.channel.send('❌ Test DM send nahi ho saka (DMs band hain).'));
            }
        }
    });

    console.log('✔ Welcome handler loaded.');
};
              
