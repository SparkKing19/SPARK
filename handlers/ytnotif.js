const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const https = require('https');
const YTNotifConfig = require('../models/ytnotif');

// Helper to fetch latest video from YouTube RSS Feed
function fetchLatestVideo(channelId) {
    return new Promise((resolve) => {
        const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const videoIdMatch = data.match(/<yt:videoId>(.*?)<\/yt:videoId>/);
                const titleMatch = data.match(/<title>(.*?)<\/title>/g);
                if (videoIdMatch && titleMatch && titleMatch[1]) {
                    const videoId = videoIdMatch[1];
                    const rawTitle = titleMatch[1].replace(/<\/?title>/g, '');
                    resolve({ videoId, title: rawTitle, url: `https://www.youtube.com/watch?v=${videoId}` });
                } else {
                    resolve(null);
                }
            });
        }).on('error', () => resolve(null));
    });
}

module.exports = (client) => {
    // 5-Minute YouTube RSS Poller
    setInterval(async () => {
        try {
            const configs = await YTNotifConfig.find({ ytChannelId: { $ne: null }, discordChannelId: { $ne: null } });
            for (const config of configs) {
                const latest = await fetchLatestVideo(config.ytChannelId);
                if (latest && latest.videoId !== config.lastVideoId) {
                    await YTNotifConfig.updateOne({ guildId: config.guildId }, { lastVideoId: latest.videoId });

                    const discordChannel = client.channels.cache.get(config.discordChannelId);
                    if (discordChannel) {
                        const msg = (config.customMessage || '📢 **New Video Uploaded!**\n\n**{title}**\n{url}')
                            .replace(/{title}/gi, latest.title)
                            .replace(/{url}/gi, latest.url);

                        await discordChannel.send(msg).catch(() => {});
                    }
                }
            }
        } catch (e) {
            console.error('YT Notifier check error:', e);
        }
    }, 5 * 60 * 1000);

    client.on('interactionCreate', async (interaction) => {
        if (interaction.isButton() && interaction.customId === 'open_yt_modal') {
            const data = await YTNotifConfig.findOne({ guildId: interaction.guild.id }) || {};

            const modal = new ModalBuilder()
                .setCustomId('yt_config_modal')
                .setTitle('YouTube Notification Setup');

            const ytInput = new TextInputBuilder()
                .setCustomId('yt_channel_id')
                .setLabel('YouTube Channel ID (e.g. UCxxxxxx)')
                .setStyle(TextInputStyle.Short)
                .setValue(data.ytChannelId || '')
                .setRequired(true);

            const discordInput = new TextInputBuilder()
                .setCustomId('discord_channel_id')
                .setLabel('Discord Notification Channel ID')
                .setStyle(TextInputStyle.Short)
                .setValue(data.discordChannelId || '')
                .setRequired(true);

            const msgInput = new TextInputBuilder()
                .setCustomId('yt_custom_msg')
                .setLabel('Notification Message')
                .setStyle(TextInputStyle.Paragraph)
                .setValue(data.customMessage || '📢 **New Video Uploaded!**\n\n**{title}**\n{url}')
                .setRequired(false);

            modal.addComponents(
                new ActionRowBuilder().addComponents(ytInput),
                new ActionRowBuilder().addComponents(discordInput),
                new ActionRowBuilder().addComponents(msgInput)
            );

            await interaction.showModal(modal);
        }

        if (interaction.isModalSubmit() && interaction.customId === 'yt_config_modal') {
            const ytChannelId = interaction.fields.getTextInputValue('yt_channel_id').trim();
            const discordChannelId = interaction.fields.getTextInputValue('discord_channel_id').trim();
            const customMessage = interaction.fields.getTextInputValue('yt_custom_msg');

            const latest = await fetchLatestVideo(ytChannelId);

            await YTNotifConfig.findOneAndUpdate(
                { guildId: interaction.guild.id },
                { ytChannelId, discordChannelId, customMessage, lastVideoId: latest?.videoId || '' },
                { upsert: true, new: true }
            );

            await interaction.reply({ content: '✅ YouTube Notification system successfully linked!', ephemeral: true });
        }
    });

    // Secret Test Command: §yt
    client.on('messageCreate', async (message) => {
        if (message.author.bot || !message.guild) return;
        if (message.content.trim() === '§yt') {
            const config = await YTNotifConfig.findOne({ guildId: message.guild.id });
            if (!config || !config.ytChannelId) return message.reply('⚠️ YouTube notifications configure nahi hain!');

            const latest = await fetchLatestVideo(config.ytChannelId);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('📺 [TEST PREVIEW] YouTube Notifier')
                .addFields(
                    { name: 'Linked YT Channel ID', value: config.ytChannelId, inline: true },
                    { name: 'Discord Post Channel', value: `<#${config.discordChannelId}>`, inline: true },
                    { name: 'Latest Video Detected', value: latest ? `[${latest.title}](${latest.url})` : 'None found', inline: false }
                );

            await message.reply({ embeds: [embed] });
        }
    });

    console.log('✔ YouTube Notification handler loaded.');
};
