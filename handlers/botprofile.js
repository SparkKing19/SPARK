const { 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder, 
    REST, 
    Routes, 
    EmbedBuilder 
} = require('discord.js');
const BotProfileConfig = require('../models/botprofile');
const { isFeatureEnabled } = require('../utils/featureCheck');

// Helper: Convert URL image to Base64 buffer string
async function urlToBase64(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch the image from URL.');
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get('content-type') || 'image/png';
    return `data:${contentType};base64,${buffer.toString('base64')}`;
}

module.exports = (client) => {

    // 1. Setup Modal Trigger via /panel (Book 3 Page 14)
    client.on('interactionCreate', async (interaction) => {
        if (interaction.isButton() && interaction.customId === 'open_botprofile_modal') {
            const data = await BotProfileConfig.findOne({ guildId: interaction.guild.id }) || {};

            const modal = new ModalBuilder()
                .setCustomId('botprofile_config_modal')
                .setTitle('Server Bot Profile Setup');

            const nickInput = new TextInputBuilder()
                .setCustomId('bot_nickname')
                .setLabel('Bot Server Nickname (Optional)')
                .setPlaceholder('Enter nickname for this server (or "reset")')
                .setStyle(TextInputStyle.Short)
                .setValue(data.nickname || '')
                .setRequired(false);

            const avatarInput = new TextInputBuilder()
                .setCustomId('bot_avatar_url')
                .setLabel('Server Profile Avatar URL (Optional)')
                .setPlaceholder('https://example.com/avatar.png (or "reset")')
                .setStyle(TextInputStyle.Short)
                .setValue(data.avatarUrl || '')
                .setRequired(false);

            const colorInput = new TextInputBuilder()
                .setCustomId('bot_banner_color')
                .setLabel('Embed Accent / Theme Color (Optional)')
                .setPlaceholder('#5865F2')
                .setStyle(TextInputStyle.Short)
                .setValue(data.bannerColor || '#5865F2')
                .setRequired(false);

            modal.addComponents(
                new ActionRowBuilder().addComponents(nickInput),
                new ActionRowBuilder().addComponents(avatarInput),
                new ActionRowBuilder().addComponents(colorInput)
            );

            await interaction.showModal(modal);
        }

        // 2. Save Modal Configuration & Apply to Guild
        if (interaction.isModalSubmit() && interaction.customId === 'botprofile_config_modal') {
            await interaction.deferReply({ ephemeral: true });

            // Check if feature is enabled via %manage
            const enabled = await isFeatureEnabled(interaction.guild.id, 'botprofile', interaction.user.id);
            if (!enabled) {
                return interaction.editReply({ 
                    content: '❌ The **Bot Profile System** is currently disabled for this server by the Bot Owner.' 
                });
            }

            const rawNick = interaction.fields.getTextInputValue('bot_nickname').trim();
            const rawAvatar = interaction.fields.getTextInputValue('bot_avatar_url').trim();
            const bannerColor = interaction.fields.getTextInputValue('bot_banner_color').trim() || '#5865F2';

            const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
            const patchBody = {};
            const appliedChanges = [];

            // A. Handle Nickname
            if (rawNick.toLowerCase() === 'reset') {
                patchBody.nick = null;
                appliedChanges.push('• Nickname reset to default bot tag.');
            } else if (rawNick.length > 0) {
                patchBody.nick = rawNick.substring(0, 32);
                appliedChanges.push(`• Nickname set to: **${patchBody.nick}**`);
            }

            // B. Handle Server Profile Avatar
            let finalAvatarUrl = rawAvatar;
            if (rawAvatar.toLowerCase() === 'reset') {
                patchBody.avatar = null;
                finalAvatarUrl = null;
                appliedChanges.push('• Profile avatar reset to global default.');
            } else if (rawAvatar.startsWith('http://') || rawAvatar.startsWith('https://')) {
                try {
                    const base64Data = await urlToBase64(rawAvatar);
                    patchBody.avatar = base64Data;
                    appliedChanges.push('• Server Profile Avatar updated successfully.');
                } catch (e) {
                    return interaction.editReply({ 
                        content: `❌ Could not process avatar image: \`${e.message}\`. Make sure the URL is a direct link to an image (PNG/JPG).` 
                    });
                }
            }

            // C. Dispatch REST Update to Discord API
            try {
                if (Object.keys(patchBody).length > 0) {
                    await rest.patch(Routes.guildMember(interaction.guild.id, '@me'), {
                        body: patchBody
                    });
                }

                await BotProfileConfig.findOneAndUpdate(
                    { guildId: interaction.guild.id },
                    { 
                        nickname: patchBody.nick === null ? null : (patchBody.nick || rawNick || null),
                        avatarUrl: finalAvatarUrl,
                        bannerColor 
                    },
                    { upsert: true, new: true }
                );

                const successEmbed = new EmbedBuilder()
                    .setColor(bannerColor)
                    .setTitle('👤 Server Bot Profile Updated')
                    .setDescription(appliedChanges.length > 0 ? appliedChanges.join('\n') : '• Profile color theme saved.')
                    .setThumbnail(interaction.guild.members.me.displayAvatarURL())
                    .setFooter({ text: 'Note: Discord per-server bio/banner is restricted for bots.' })
                    .setTimestamp();

                return interaction.editReply({ embeds: [successEmbed] });

            } catch (err) {
                console.error('Bot Profile Update Error:', err);
                return interaction.editReply({ 
                    content: `❌ Discord API Error: \`${err.message}\`\n(Make sure the bot has \`Change Nickname\` and higher role position).` 
                });
            }
        }
    });

    console.log('✔ Custom Bot Profile handler loaded.');
};
