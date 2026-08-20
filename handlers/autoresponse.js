const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const AutoResponseConfig = require('../models/autoresponse');

module.exports = (client) => {
    client.on('interactionCreate', async (interaction) => {
        if (interaction.isButton() && interaction.customId === 'open_autoresponse_modal') {
            const data = await AutoResponseConfig.findOne({ guildId: interaction.guild.id }) || {};

            const modal = new ModalBuilder()
                .setCustomId('autoresponse_config_modal')
                .setTitle('Auto Response Configuration');

            const input = new TextInputBuilder()
                .setCustomId('autoresponse_input')
                .setLabel('Trigger:Response (Max 3, sep by ||)')
                .setPlaceholder('ip:play.network.fun || qr:https://image.png || store:store.fun')
                .setStyle(TextInputStyle.Paragraph)
                .setValue(data.rawConfig || '')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
        }

        if (interaction.isModalSubmit() && interaction.customId === 'autoresponse_config_modal') {
            const rawConfig = interaction.fields.getTextInputValue('autoresponse_input');
            const entries = rawConfig.split('||').map(s => s.trim()).filter(Boolean).slice(0, 3);

            const responses = entries.map(entry => {
                const parts = entry.split(':');
                return {
                    trigger: parts[0]?.trim().toLowerCase(),
                    response: parts.slice(1).join(':').trim()
                };
            }).filter(e => e.trigger && e.response);

            await AutoResponseConfig.findOneAndUpdate(
                { guildId: interaction.guild.id },
                { responses, rawConfig },
                { upsert: true, new: true }
            );

            await interaction.reply({ content: `✅ Successfully configured **${responses.length}** auto responses!`, ephemeral: true });
        }
    });

    client.on('messageCreate', async (message) => {
        if (message.author.bot || !message.guild) return;

        // Secret Test Command: §autoresponse
        if (message.content.trim() === '§autoresponse') {
            const config = await AutoResponseConfig.findOne({ guildId: message.guild.id });
            if (!config || !config.responses.length) return message.reply('⚠️ No auto responses configured!');

            const list = config.responses.map((r, i) => `**${i + 1}.** Trigger: \`${r.trigger}\` ➔ Response: \`${r.response}\``).join('\n');
            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('🤖 [TEST PREVIEW] Configured Auto Responses')
                .setDescription(list);

            return message.reply({ embeds: [embed] });
        }

        const config = await AutoResponseConfig.findOne({ guildId: message.guild.id });
        if (!config || !config.responses || config.responses.length === 0) return;

        const content = message.content.toLowerCase();

        for (const item of config.responses) {
            const regex = new RegExp(`\\b${item.trigger}\\b`, 'i');
            if (regex.test(content)) {
                if (item.response.startsWith('http://') || item.response.startsWith('https://')) {
                    const embed = new EmbedBuilder().setColor('#00FFAA').setImage(item.response);
                    await message.channel.send({ embeds: [embed] }).catch(() => message.channel.send(item.response));
                } else {
                    await message.channel.send(item.response);
                }
                break;
            }
        }
    });

    console.log('✔ Auto-Response handler loaded.');
};
