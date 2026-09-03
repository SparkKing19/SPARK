const { 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder, 
    EmbedBuilder, 
    StringSelectMenuBuilder 
} = require('discord.js');
const OnboardingConfig = require('../models/onboarding');

// Parser: (emoji) Title: Question - Ans 1 (RoleID) - Ans 2 (RoleID) | on/off || ...
function parseExactFormat(rawConfig, rawChannels) {
    const channelList = rawChannels.split('||').map(s => s.trim()).filter(Boolean);
    const stepBlocks = rawConfig.split('||').map(s => s.trim()).filter(Boolean);
    const steps = [];

    stepBlocks.forEach((block, index) => {
        // 1. Separate Flag (| on / | off)
        const pipeParts = block.split('|');
        const mainPart = pipeParts[0]?.trim() || '';
        const isMultiple = pipeParts[1] ? pipeParts[1].trim().toLowerCase() === 'on' : false;

        // 2. Separate Header from Body via colon (:)
        const colonIndex = mainPart.indexOf(':');
        if (colonIndex === -1) return;

        const headerPart = mainPart.slice(0, colonIndex).trim();
        const bodyPart = mainPart.slice(colonIndex + 1).trim();

        // 3. Extract Emoji & Title
        let emoji = '⭐';
        let title = headerPart;

        const emojiMatch = headerPart.match(/^(\p{Extended_Pictographic}|<a?:[a-zA-Z0-9_~]+:\d+>)\s*(.*)$/u);
        if (emojiMatch) {
            emoji = emojiMatch[1] || '⭐';
            title = emojiMatch[2].trim() || 'Onboarding';
        }

        // 4. Separate Question from Options using the first hyphen (-)
        const dashParts = bodyPart.split('-').map(s => s.trim()).filter(Boolean);
        if (dashParts.length < 2) return;

        const question = dashParts[0]; // Pehla part Question hai
        const rawOptions = dashParts.slice(1); // Baaki saare Options hain

        const parsedOptions = [];

        rawOptions.forEach(opt => {
            const roleMatch = opt.match(/(\d{17,20})/);
            if (!roleMatch) return;

            const roleId = roleMatch[1];
            let labelText = opt.replace(/\(?<@&?\d{17,20}>?\)?/, '').trim();

            let optEmoji = null;
            const optEmojiMatch = labelText.match(/^(\p{Extended_Pictographic}|<a?:[a-zA-Z0-9_~]+:\d+>)\s*(.*)$/u);
            if (optEmojiMatch) {
                optEmoji = optEmojiMatch[1];
                labelText = optEmojiMatch[2].trim();
            }

            parsedOptions.push({
                emoji: optEmoji,
                label: labelText || `Role ${roleId}`,
                roleId
            });
        });

        if (parsedOptions.length > 0) {
            steps.push({
                emoji,
                title,
                question,
                isMultiple,
                channelId: channelList[index] || channelList[0] || null,
                options: parsedOptions
            });
        }
    });

    return steps;
}

// Build Step Dropdown Embed & ActionRow
function buildStepPayload(step, stepIndex, isTest = false) {
    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(`${step.emoji} ${step.title}`)
        .setDescription(
            `**${step.question}**\n\n` +
            `*${step.isMultiple ? '☑️ You can select multiple roles from the menu.' : '🔘 Select a single role from the menu below.'}*`
        )
        .setFooter({ text: `Onboarding Step #${stepIndex + 1}` })
        .setTimestamp();

    const menuOptions = step.options.map(opt => {
        const item = {
            label: opt.label.substring(0, 100),
            value: opt.roleId,
            description: `Toggle role: ${opt.label}`.substring(0, 100)
        };
        if (opt.emoji) item.emoji = opt.emoji;
        return item;
    });

    const maxValues = step.isMultiple ? menuOptions.length : 1;

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(isTest ? `test_onboarding_${stepIndex}` : `onboarding_select_${stepIndex}`)
        .setPlaceholder(step.question.length > 100 ? `${step.question.substring(0, 97)}...` : step.question)
        .setMinValues(0)
        .setMaxValues(maxValues)
        .addOptions(menuOptions.slice(0, 25));

    const row = new ActionRowBuilder().addComponents(selectMenu);
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
                .setLabel('(emoji) Title: question - opt 1 (ID) | on')
                .setPlaceholder('🔔 Updates: Pick alerts - 📢 Updates (ROLE_ID) - 🎁 Giveaways (ROLE_ID) | on || ...')
                .setStyle(TextInputStyle.Paragraph)
                .setValue(data.rawConfig || '')
                .setRequired(true);

            const channelsInput = new TextInputBuilder()
                .setCustomId('onboarding_channels_input')
                .setLabel('Channel IDs (Separated by ||)')
                .setPlaceholder('CHANNEL_ID_1 || CHANNEL_ID_2')
                .setStyle(TextInputStyle.Short)
                .setValue(data.rawChannels || '')
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(configInput),
                new ActionRowBuilder().addComponents(channelsInput)
            );

            await interaction.showModal(modal);
        }

        // 2. Save Modal Configuration & Send to Channels
        if (interaction.isModalSubmit() && interaction.customId === 'onboarding_config_modal') {
            await interaction.deferReply({ ephemeral: true });

            const rawConfig = interaction.fields.getTextInputValue('onboarding_config_input');
            const rawChannels = interaction.fields.getTextInputValue('onboarding_channels_input');

            const steps = parseExactFormat(rawConfig, rawChannels);

            if (steps.length === 0) {
                return interaction.editReply({ 
                    content: '❌ Invalid format! Please make sure your format follows: `(emoji) Title: Question - Ans 1 (ROLE_ID) - Ans 2 (ROLE_ID) | on/off`' 
                });
            }

            const saved = await OnboardingConfig.findOneAndUpdate(
                { guildId: interaction.guild.id },
                { rawConfig, rawChannels, steps },
                { upsert: true, new: true }
            );

            let sentCount = 0;
            const dispatchLogs = [];

            // Dispatch to target channels
            for (let i = 0; i < saved.steps.length; i++) {
                const step = saved.steps[i];
                if (step.channelId) {
                    try {
                        const targetChannel = await interaction.guild.channels.fetch(step.channelId).catch(() => null);
                        if (targetChannel) {
                            const { embed, row } = buildStepPayload(step, i, false);
                            await targetChannel.send({ embeds: [embed], components: [row] });
                            sentCount++;
                            dispatchLogs.push(`✔ Sent Step #${i + 1} to <#${step.channelId}>`);
                        } else {
                            dispatchLogs.push(`✖ Could not find channel \`${step.channelId}\``);
                        }
                    } catch (err) {
                        console.error(`Error sending onboarding step to ${step.channelId}:`, err);
                        dispatchLogs.push(`✖ Error sending to \`${step.channelId}\`: ${err.message}`);
                    }
                }
            }

            await interaction.editReply({ 
                content: `✅ Onboarding configured! Successfully delivered **${sentCount}/${saved.steps.length}** panels.\n\n${dispatchLogs.join('\n')}` 
            });
        }

        // 3. Demo Preview Response
        if (interaction.isStringSelectMenu() && interaction.customId.startsWith('test_onboarding_')) {
            return interaction.reply({ 
                content: '⚠️ **[DEMO PREVIEW]** This is only a preview menu. Roles are not toggled here.', 
                ephemeral: true 
            });
        }

        // 4. Role Toggle Handler
        if (interaction.isStringSelectMenu() && interaction.customId.startsWith('onboarding_select_')) {
            const stepIndex = parseInt(interaction.customId.replace('onboarding_select_', ''), 10);
            const data = await OnboardingConfig.findOne({ guildId: interaction.guild.id });

            if (!data || !data.steps || !data.steps[stepIndex]) {
                return interaction.reply({ content: '❌ Onboarding configuration not found.', ephemeral: true });
            }

            const step = data.steps[stepIndex];
            const member = interaction.member;
            const selectedRoleIds = interaction.values;
            const stepAllRoleIds = step.options.map(o => o.roleId);

            const added = [];
            const removed = [];

            if (!step.isMultiple) {
                for (const rId of stepAllRoleIds) {
                    if (member.roles.cache.has(rId) && !selectedRoleIds.includes(rId)) {
                        await member.roles.remove(rId).catch(() => {});
                        removed.push(`<@&${rId}>`);
                    }
                }
            }

            for (const rId of stepAllRoleIds) {
                const hasRole = member.roles.cache.has(rId);
                const isSelected = selectedRoleIds.includes(rId);

                if (isSelected && !hasRole) {
                    await member.roles.add(rId).catch(() => {});
                    added.push(`<@&${rId}>`);
                } else if (!isSelected && hasRole) {
                    await member.roles.remove(rId).catch(() => {});
                    removed.push(`<@&${rId}>`);
                }
            }

            let responseMsg = '✅ **Roles Updated Successfully:**\n';
            if (added.length > 0) responseMsg += `➕ Added: ${added.join(', ')}\n`;
            if (removed.length > 0) responseMsg += `➖ Removed: ${removed.join(', ')}\n`;
            if (added.length === 0 && removed.length === 0) responseMsg = 'ℹ️ No role changes were made.';

            return interaction.reply({ content: responseMsg, ephemeral: true });
        }
    });

    // 5. Test Command: §onboarding
    client.on('messageCreate', async (message) => {
        if (message.author.bot || !message.guild) return;

        if (message.content.trim() === '§onboarding') {
            const data = await OnboardingConfig.findOne({ guildId: message.guild.id });

            if (!data || !data.steps || data.steps.length === 0) {
                return message.reply('⚠️ Please configure onboarding via `/panel book:1 page:3` first!');
            }

            await message.reply({ content: `**[TEST PREVIEW] Total Onboarding Steps: ${data.steps.length}**` });

            for (let i = 0; i < data.steps.length; i++) {
                const { embed, row } = buildStepPayload(data.steps[i], i, true);
                await message.channel.send({ embeds: [embed], components: [row] });
            }
        }
    });

    console.log('✔ Exact Syntax Onboarding handler loaded.');
};
    
