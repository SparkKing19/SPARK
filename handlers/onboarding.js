const { 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder, 
    EmbedBuilder, 
    StringSelectMenuBuilder 
} = require('discord.js');
const OnboardingConfig = require('../models/onboarding');

// Parse: (emoji) Title: Question, ans option 1 - ans option 2 | on/off || ...
function parseOnboardingConfig(rawConfig, rawChannels) {
    const channelList = rawChannels.split('||').map(s => s.trim()).filter(Boolean);
    const stepBlocks = rawConfig.split('||').map(s => s.trim()).filter(Boolean);
    const steps = [];

    stepBlocks.forEach((block, index) => {
        const colonIndex = block.indexOf(':');
        if (colonIndex === -1) return;

        // Extract Title and optional Emoji
        const headerPart = block.slice(0, colonIndex).trim();
        const contentPart = block.slice(colonIndex + 1).trim();

        let emoji = '⭐';
        let title = headerPart;

        const emojiMatch = headerPart.match(/^(\p{Extended_Pictographic}|<a?:[a-zA-Z0-9_~]+:\d+>)\s*(.*)$/u);
        if (emojiMatch) {
            emoji = emojiMatch[1];
            title = emojiMatch[2].trim() || 'Onboarding';
        }

        // Split question and answer options
        const commaIndex = contentPart.indexOf(',');
        if (commaIndex === -1) return;

        const question = contentPart.slice(0, commaIndex).trim();
        const optionsAndFlag = contentPart.slice(commaIndex + 1).trim();

        // Split options & on/off multiple flag
        const pipeParts = optionsAndFlag.split('|');
        const optionsPart = pipeParts[0]?.trim() || '';
        const isMultiple = pipeParts[1] ? pipeParts[1].trim().toLowerCase() === 'on' : false;

        // Split individual answers (separated by hyphen -)
        const rawOptions = optionsPart.split('-').map(s => s.trim()).filter(Boolean);
        const parsedOptions = [];

        rawOptions.forEach(opt => {
            // Match: Emoji Label (@RoleID or RoleID)
            const optMatch = opt.match(/^(?:(\p{Extended_Pictographic}|<a?:[a-zA-Z0-9_~]+:\d+>)\s*)?(.+?)\s*(?:<@&|@)?(\d{17,20})>?$/u);
            if (optMatch) {
                parsedOptions.push({
                    emoji: optMatch[1] || null,
                    label: optMatch[2].trim(),
                    roleId: optMatch[3]
                });
            } else {
                // Fallback: Label (RoleID)
                const fallbackMatch = opt.match(/(.+?)\s*\((\d{17,20})\)/);
                if (fallbackMatch) {
                    parsedOptions.push({
                        emoji: null,
                        label: fallbackMatch[1].trim(),
                        roleId: fallbackMatch[2]
                    });
                }
            }
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
            `${step.question}\n\n` +
            `*${step.isMultiple ? '☑️ You can select multiple options.' : '🔘 Select only one option from the menu.'}*`
        )
        .setFooter({ text: `Onboarding Step #${stepIndex + 1}` })
        .setTimestamp();

    const menuOptions = step.options.map(opt => {
        const item = {
            label: opt.label.substring(0, 100),
            value: opt.roleId,
            description: `Toggle the @${opt.label} role`
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
                .setLabel('Steps Config')
                .setPlaceholder('📢 Alerts: Pick updates, 🔔 Updates (ROLE_ID) - 🎁 Giveaways (ROLE_ID) | on || ...')
                .setStyle(TextInputStyle.Paragraph)
                .setValue(data.rawConfig || '')
                .setRequired(true);

            const channelsInput = new TextInputBuilder()
                .setCustomId('onboarding_channels_input')
                .setLabel('Destination Channel IDs (Sep by ||)')
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

        // 2. Save Modal Configuration
        if (interaction.isModalSubmit() && interaction.customId === 'onboarding_config_modal') {
            await interaction.deferReply({ ephemeral: true });

            const rawConfig = interaction.fields.getTextInputValue('onboarding_config_input');
            const rawChannels = interaction.fields.getTextInputValue('onboarding_channels_input');

            const steps = parseOnboardingConfig(rawConfig, rawChannels);

            if (steps.length === 0) {
                return interaction.editReply({ 
                    content: '❌ Invalid syntax! Please follow: `(emoji) Title: Question, Option1 (ROLE_ID) - Option2 (ROLE_ID) | on/off`' 
                });
            }

            const saved = await OnboardingConfig.findOneAndUpdate(
                { guildId: interaction.guild.id },
                { rawConfig, rawChannels, steps },
                { upsert: true, new: true }
            );

            // Send interactive dropdown panels to destination channels
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
                content: `✅ Onboarding Setup Complete! Dispatched **${saved.steps.length}** interactive dropdown step(s).` 
            });
        }

        // 3. Demo Preview Response
        if (interaction.isStringSelectMenu() && interaction.customId.startsWith('test_onboarding_')) {
            return interaction.reply({ 
                content: '⚠️ **[DEMO PREVIEW]** This is only a preview menu. Roles are not toggled here.', 
                ephemeral: true 
            });
        }

        // 4. Real Dropdown Role Toggle Handler
        if (interaction.isStringSelectMenu() && interaction.customId.startsWith('onboarding_select_')) {
            const stepIndex = parseInt(interaction.customId.replace('onboarding_select_', ''), 10);
            const data = await OnboardingConfig.findOne({ guildId: interaction.guild.id });

            if (!data || !data.steps || !data.steps[stepIndex]) {
                return interaction.reply({ content: '❌ Onboarding configuration not found.', ephemeral: true });
            }

            const step = data.steps[stepIndex];
            const member = interaction.member;
            const selectedRoleIds = interaction.values; // Selected role IDs in the menu
            const stepAllRoleIds = step.options.map(o => o.roleId);

            const added = [];
            const removed = [];

            // If it is single-choice, remove all other roles belonging to this step first
            if (!step.isMultiple) {
                for (const rId of stepAllRoleIds) {
                    if (member.roles.cache.has(rId) && !selectedRoleIds.includes(rId)) {
                        await member.roles.remove(rId).catch(() => {});
                        removed.push(`<@&${rId}>`);
                    }
                }
            }

            // Sync selected roles
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

    // 5. Preview Command: §onboarding
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

    console.log('✔ Dropdown Onboarding handler loaded.');
};
