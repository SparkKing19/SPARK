const { 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder, 
    EmbedBuilder, 
    ButtonBuilder, 
    ButtonStyle 
} = require('discord.js');
const OnboardingConfig = require('../models/onboarding');

function buildStepPayload(step, index, isTest = false) {
    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(`${step.emoji} ${step.title}`)
        .setDescription(`${step.question}\n\n**Role:** <@&${step.roleId}>`)
        .setFooter({ text: `Onboarding Step #${index + 1}` })
        .setTimestamp();

    const button = new ButtonBuilder()
        .setCustomId(isTest ? `test_onboarding_${index}` : `onboarding_claim_${step.roleId}`)
        .setLabel(`Get ${step.title}`)
        .setStyle(ButtonStyle.Primary);

    if (step.emoji) {
        button.setEmoji(step.emoji);
    }

    const row = new ActionRowBuilder().addComponents(button);
    return { embed, row };
}

module.exports = (client) => {

    client.on('interactionCreate', async (interaction) => {
        // 1. Open Setup Modal
        if (interaction.isButton() && interaction.customId === 'open_onboarding_modal') {
            const data = await OnboardingConfig.findOne({ guildId: interaction.guild.id }) || {};

            const modal = new ModalBuilder()
                .setCustomId('onboarding_config_modal')
                .setTitle('Onboarding System Setup');

            const configInput = new TextInputBuilder()
                .setCustomId('onboarding_config_input')
                .setLabel('Emoji, Title, Question, RoleID (Max 5)')
                .setPlaceholder('📢, Announcements, Get pinged for updates?, 123456789 || 🎮, Gamer, Ping for gaming?, 987654321')
                .setStyle(TextInputStyle.Paragraph)
                .setValue(data.rawConfig || '')
                .setRequired(true);

            const channelsInput = new TextInputBuilder()
                .setCustomId('onboarding_channels_input')
                .setLabel('Channel IDs (Separated by ||)')
                .setPlaceholder('CHANNEL_ID_1 || CHANNEL_ID_2 || CHANNEL_ID_3')
                .setStyle(TextInputStyle.Paragraph)
                .setValue(data.rawChannels || '')
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(configInput),
                new ActionRowBuilder().addComponents(channelsInput)
            );

            await interaction.showModal(modal);
        }

        // 2. Save Modal Configuration
        if (interaction.isModalSubmit() && interaction.customId === 'onboarding_config_modal') {
            await interaction.deferReply({ ephemeral: true });

            const rawConfig = interaction.fields.getTextInputValue('onboarding_config_input');
            const rawChannels = interaction.fields.getTextInputValue('onboarding_channels_input');

            const configParts = rawConfig.split('||').map(s => s.trim()).filter(Boolean).slice(0, 5);
            const channelParts = rawChannels.split('||').map(s => s.trim()).filter(Boolean).slice(0, 5);

            const steps = [];

            for (let i = 0; i < configParts.length; i++) {
                const subParts = configParts[i].split(',').map(p => p.trim());
                const emoji = subParts[0] || '⭐';
                const title = subParts[1] || 'Role';
                const question = subParts[2] || 'Click below to get this role!';
                const roleId = subParts[3] || null;
                const channelId = channelParts[i] || channelParts[0] || null;

                if (roleId) {
                    steps.push({ emoji, title, question, roleId, channelId });
                }
            }

            const saved = await OnboardingConfig.findOneAndUpdate(
                { guildId: interaction.guild.id },
                { rawConfig, rawChannels, steps },
                { upsert: true, new: true }
            );

            // Send Embeds to respective channels
            for (let i = 0; i < saved.steps.length; i++) {
                const step = saved.steps[i];
                if (step.channelId) {
                    const targetChannel = interaction.guild.channels.cache.get(step.channelId);
                    if (targetChannel) {
                        const { embed, row } = buildStepPayload(step, i, false);
                        await targetChannel.send({ embeds: [embed], components: [row] }).catch(() => {});
                    }
                }
            }

            await interaction.editReply({ 
                content: `✅ Onboarding Setup Complete! Total **${saved.steps.length}** onboarding step(s) configure ho gaye hain.` 
            });
        }

        // 3. Demo Preview Button Click
        if (interaction.isButton() && interaction.customId.startsWith('test_onboarding_')) {
            return interaction.reply({ 
                content: '⚠️ **[DEMO PREVIEW]** Ye sirf test preview hai. Real role assign hone ke liye configured channel ke buttons use karein.', 
                ephemeral: true 
            });
        }

        // 4. Real Role Toggle Interaction
        if (interaction.isButton() && interaction.customId.startsWith('onboarding_claim_')) {
            const roleId = interaction.customId.replace('onboarding_claim_', '');
            const role = interaction.guild.roles.cache.get(roleId);

            if (!role) {
                return interaction.reply({ content: '❌ Ye role server me exist nahi karta ya delete ho chuka hai.', ephemeral: true });
            }

            const member = interaction.member;

            if (member.roles.cache.has(roleId)) {
                await member.roles.remove(roleId).catch(() => {});
                return interaction.reply({ content: `➖ <@&${roleId}> role aapse **hata** diya gaya hai.`, ephemeral: true });
            } else {
                await member.roles.add(roleId).catch(() => {});
                return interaction.reply({ content: `➕ <@&${roleId}> role aapko **assign** kar diya gaya hai!`, ephemeral: true });
            }
        }
    });

    // 5. Test Command: §onboarding
    client.on('messageCreate', async (message) => {
        if (message.author.bot || !message.guild) return;

        if (message.content.trim() === '§onboarding') {
            const data = await OnboardingConfig.findOne({ guildId: message.guild.id });

            if (!data || !data.steps || data.steps.length === 0) {
                return message.reply('⚠️ Pehle `/panel page:3` run karke onboarding steps setup karein!');
            }

            await message.reply({ content: `**[TEST PREVIEW] Total Onboarding Steps: ${data.steps.length}**` });

            for (let i = 0; i < data.steps.length; i++) {
                const { embed, row } = buildStepPayload(data.steps[i], i, true);
                await message.channel.send({ embeds: [embed], components: [row] });
            }
        }
    });

    console.log('✔ Onboarding handler loaded.');
};
