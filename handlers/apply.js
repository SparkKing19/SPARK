const { 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder, 
    EmbedBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ChannelType, 
    PermissionFlagsBits 
} = require('discord.js');
const ApplyConfig = require('../models/apply');

function createApplyPanel() {
    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('📝 Staff Application')
        .setDescription('Interested in joining our team? Click the button below to start your application!')
        .setFooter({ text: 'Answer all questions honestly.' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('start_staff_application')
            .setLabel('Apply Now')
            .setStyle(ButtonStyle.Success)
            .setEmoji('📋')
    );

    return { embed, row };
}

module.exports = (client) => {

    // 1-Hour Inactive Application Auto-Delete Cleaner
    setInterval(async () => {
        try {
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            const configs = await ApplyConfig.find({ 'activeSessions.createdAt': { $lte: oneHourAgo } });

            for (const config of configs) {
                const expired = config.activeSessions.filter(s => new Date(s.createdAt) <= oneHourAgo);
                for (const session of expired) {
                    const guild = client.guilds.cache.get(config.guildId);
                    if (guild) {
                        const ch = guild.channels.cache.get(session.channelId);
                        if (ch) await ch.delete().catch(() => {});
                    }
                    await ApplyConfig.updateOne(
                        { guildId: config.guildId },
                        { $pull: { activeSessions: { channelId: session.channelId } } }
                    );
                }
            }
        } catch (e) {
            console.error('Apply cleaner error:', e);
        }
    }, 5 * 60 * 1000);

    client.on('interactionCreate', async (interaction) => {
        // Setup Modal
        if (interaction.isButton() && interaction.customId === 'open_apply_modal') {
            const data = await ApplyConfig.findOne({ guildId: interaction.guild.id }) || {};

            const modal = new ModalBuilder()
                .setCustomId('apply_config_modal')
                .setTitle('Staff Application Setup');

            const qInput = new TextInputBuilder()
                .setCustomId('apply_questions')
                .setLabel('Questions (Comma Separated)')
                .setPlaceholder('What is your age?, Past experience?, Why choose you?')
                .setStyle(TextInputStyle.Paragraph)
                .setValue(data.rawQuestions || '')
                .setRequired(true);

            const chInput = new TextInputBuilder()
                .setCustomId('apply_channels')
                .setLabel('Panel Channel ID || Review Channel ID')
                .setPlaceholder('PANEL_CHANNEL_ID || REVIEW_CHANNEL_ID')
                .setStyle(TextInputStyle.Short)
                .setValue(data.panelChannelId && data.reviewChannelId ? `${data.panelChannelId} || ${data.reviewChannelId}` : '')
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(qInput),
                new ActionRowBuilder().addComponents(chInput)
            );

            await interaction.showModal(modal);
        }

        // Save Config & Send Main Apply Panel
        if (interaction.isModalSubmit() && interaction.customId === 'apply_config_modal') {
            const rawQuestions = interaction.fields.getTextInputValue('apply_questions');
            const rawChannels = interaction.fields.getTextInputValue('apply_channels');

            const questions = rawQuestions.split(',').map(q => q.trim()).filter(Boolean);
            const [panelChannelId, reviewChannelId] = rawChannels.split('||').map(c => c.trim());

            const config = await ApplyConfig.findOneAndUpdate(
                { guildId: interaction.guild.id },
                { questions, rawQuestions, panelChannelId, reviewChannelId },
                { upsert: true, new: true }
            );

            if (panelChannelId) {
                const target = interaction.guild.channels.cache.get(panelChannelId);
                if (target) {
                    const { embed, row } = createApplyPanel();
                    await target.send({ embeds: [embed], components: [row] });
                }
            }

            await interaction.reply({ content: '✅ Staff Application System configured successfully!', ephemeral: true });
        }

        // User Clicks Apply Now
        if (interaction.isButton() && interaction.customId === 'start_staff_application') {
            const config = await ApplyConfig.findOne({ guildId: interaction.guild.id });
            if (!config || !config.questions.length) {
                return interaction.reply({ content: '⚠️ Application system is not ready yet.', ephemeral: true });
            }

            const existing = config.activeSessions.find(s => s.userId === interaction.user.id);
            if (existing && interaction.guild.channels.cache.has(existing.channelId)) {
                return interaction.reply({ content: `❌ You already have an active application: <#${existing.channelId}>`, ephemeral: true });
            }

            const applyChannel = await interaction.guild.channels.create({
                name: `apply-${interaction.user.username}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                    { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
                ]
            });

            await ApplyConfig.findOneAndUpdate(
                { guildId: interaction.guild.id },
                { $push: { activeSessions: { userId: interaction.user.id, channelId: applyChannel.id, step: 0, answers: [] } } }
            );

            await applyChannel.send(`👋 Hey <@${interaction.user.id}>! Application started.\n⏰ **Note:** You have 1 hour to complete this form.\n\n**Question 1:** ${config.questions[0]}`);
            await interaction.reply({ content: `✅ Application channel opened: ${applyChannel}`, ephemeral: true });
        }

        // Approve Button Click -> Prompt Decision DM Modal
        if (interaction.isButton() && interaction.customId.startsWith('apply_approve_')) {
            const targetUserId = interaction.customId.replace('apply_approve_', '');
            const modal = new ModalBuilder()
                .setCustomId(`apply_modal_decision_accept_${targetUserId}`)
                .setTitle('Acceptance DM Message');

            const dmInput = new TextInputBuilder()
                .setCustomId('decision_dm_text')
                .setLabel('Acceptance Message for User')
                .setStyle(TextInputStyle.Paragraph)
                .setValue('🎉 Congratulations! Your staff application has been APPROVED. Welcome to the team!')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(dmInput));
            await interaction.showModal(modal);
        }

        // Reject Button Click -> Prompt Decision DM Modal
        if (interaction.isButton() && interaction.customId.startsWith('apply_reject_')) {
            const targetUserId = interaction.customId.replace('apply_reject_', '');
            const modal = new ModalBuilder()
                .setCustomId(`apply_modal_decision_reject_${targetUserId}`)
                .setTitle('Rejection DM Message');

            const dmInput = new TextInputBuilder()
                .setCustomId('decision_dm_text')
                .setLabel('Rejection Message for User')
                .setStyle(TextInputStyle.Paragraph)
                .setValue('Thank you for applying. Unfortunately, your application was not accepted at this time.')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(dmInput));
            await interaction.showModal(modal);
        }

        // Submit Decision DM & Dispatch
        if (interaction.isModalSubmit() && interaction.customId.startsWith('apply_modal_decision_')) {
            const isAccept = interaction.customId.includes('_accept_');
            const targetUserId = interaction.customId.split('_').pop();
            const messageText = interaction.fields.getTextInputValue('decision_dm_text');

            const user = await client.users.fetch(targetUserId).catch(() => null);
            if (user) {
                const embed = new EmbedBuilder()
                    .setColor(isAccept ? '#2ECC71' : '#ED4245')
                    .setTitle(isAccept ? '✅ Application Accepted' : '❌ Application Decision')
                    .setDescription(messageText)
                    .setTimestamp();

                await user.send({ embeds: [embed] }).catch(() => {});
            }

            await interaction.reply({ content: `✅ User notified via DM and marked as **${isAccept ? 'APPROVED' : 'REJECTED'}**!`, ephemeral: true });
            await interaction.message.edit({ components: [] });
        }
    });

    // Step-by-Step Question Response Tracker
    client.on('messageCreate', async (message) => {
        if (message.author.bot || !message.guild) return;

        const config = await ApplyConfig.findOne({ guildId: message.guild.id });
        if (!config) return;

        const sessionIndex = config.activeSessions.findIndex(s => s.channelId === message.channel.id && s.userId === message.author.id);
        if (sessionIndex === -1) return;

        const session = config.activeSessions[sessionIndex];
        session.answers.push(message.content);
        session.step += 1;

        if (session.step < config.questions.length) {
            await message.channel.send(`**Question ${session.step + 1}:** ${config.questions[session.step]}`);
            await ApplyConfig.updateOne(
                { guildId: message.guild.id, 'activeSessions.channelId': message.channel.id },
                { $set: { 'activeSessions.$.step': session.step, 'activeSessions.$.answers': session.answers } }
            );
        } else {
            await message.channel.send('✅ Thank you! Application submitted. This channel will close in 5 seconds.');

            // Send to Staff Review Channel
            if (config.reviewChannelId) {
                const reviewChannel = message.guild.channels.cache.get(config.reviewChannelId);
                if (reviewChannel) {
                    const reviewEmbed = new EmbedBuilder()
                        .setColor('#5865F2')
                        .setTitle(`📋 New Staff Application from ${message.author.tag}`)
                        .setThumbnail(message.author.displayAvatarURL())
                        .setTimestamp();

                    config.questions.forEach((q, i) => {
                        reviewEmbed.addFields({ name: `Q${i + 1}: ${q}`, value: session.answers[i] || 'No answer', inline: false });
                    });

                    const actionRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`apply_approve_${message.author.id}`)
                            .setLabel('Approve')
                            .setStyle(ButtonStyle.Success)
                            .setEmoji('✅'),
                        new ButtonBuilder()
                            .setCustomId(`apply_reject_${message.author.id}`)
                            .setLabel('Reject')
                            .setStyle(ButtonStyle.Danger)
                            .setEmoji('❌')
                    );

                    await reviewChannel.send({ embeds: [reviewEmbed], components: [actionRow] });
                }
            }

            await ApplyConfig.updateOne(
                { guildId: message.guild.id },
                { $pull: { activeSessions: { channelId: message.channel.id } } }
            );

            setTimeout(() => message.channel.delete().catch(() => {}), 5000);
        }
    });

    // Secret Test Command: §apply
    client.on('messageCreate', async (message) => {
        if (message.author.bot || !message.guild) return;
        if (message.content.trim() === '§apply') {
            const { embed, row } = createApplyPanel();
            await message.reply({ content: '**[TEST PREVIEW] Staff Apply Panel:**', embeds: [embed], components: [row] });
        }
    });

    console.log('✔ Apply handler loaded.');
};
