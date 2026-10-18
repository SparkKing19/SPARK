const AIConfig = require('../models/aiConfig');
const { isFeatureEnabled } = require('../utils/featureCheck');
const { EmbedBuilder, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');

const BOT_OWNERS = [
    '1549995551288852584', // FZBOY
    '1266728371719508062', // FZBOY
    '1474216218792558735'  // DAREQUEEN
];

const OWNERS_INFO = {
    '1549995551288852584': { name: 'FZBOY', gender: 'male' },
    '1266728371719508062': { name: 'FZBOY', gender: 'male' },
    '1474216218792558735': { name: 'DAREQUEEN', gender: 'female' }
};

const DYNAMIC_BG_GIF = 'https://cdn.discordapp.com/attachments/1540696710387335330/1561320565824819200/IMG_419c1bc5-8c2f-4a1d-bee2-12c277981844.gif?ex=6ad5ec96&is=6ad49b16&hm=01865ada94ac14828df2910ef44b3f34a65149323d5938feae3c1467674051e0&';
const conversationMemory = new Map();

// Groq Function Calling Definitions
const tools = [
    {
        type: 'function',
        function: {
            name: 'send_channel_message',
            description: 'Send a message or announcement to a specific channel.',
            parameters: {
                type: 'object',
                properties: {
                    channel_id: { type: 'string', description: 'Discord channel ID' },
                    content: { type: 'string', description: 'Message content' }
                },
                required: ['channel_id', 'content']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'send_user_dm',
            description: 'Send direct DM to a user via bot.',
            parameters: {
                type: 'object',
                properties: {
                    user_id: { type: 'string', description: 'Target user ID' },
                    message: { type: 'string', description: 'Message to send' }
                },
                required: ['user_id', 'message']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'purge_messages',
            description: 'Purge messages from channel.',
            parameters: {
                type: 'object',
                properties: {
                    amount: { type: 'number', description: 'Count between 1 to 100' }
                },
                required: ['amount']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'show_demo',
            description: 'Show demo card or ticket.',
            parameters: {
                type: 'object',
                properties: {
                    feature: { type: 'string', enum: ['welcome', 'ticket'] }
                },
                required: ['feature']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'generate_image',
            description: 'Generate an AI photo/image from prompt.',
            parameters: {
                type: 'object',
                properties: {
                    prompt: { type: 'string', description: 'English prompt for image' }
                },
                required: ['prompt']
            }
        }
    }
];

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        if (!message.guild || message.author.bot) return;

        const content = message.content.trim();
        const isBotOwner = BOT_OWNERS.includes(message.author.id);
        const isServerOwner = message.author.id === message.guild.ownerId;
        const isAdmin = message.member?.permissions.has(PermissionFlagsBits.Administrator);

        // 1. SETUP COMMANDS (%ai set, %ai clear, %ai off)
        if (content.toLowerCase().startsWith('%ai')) {
            const args = content.split(/ +/).slice(1);
            const sub = args[0]?.toLowerCase();

            if (!isBotOwner && !isServerOwner && !isAdmin) {
                return message.reply('❌ AI settings manage karne ki permission nahi hai.');
            }

            if (sub === 'set') {
                const targetChannel = message.mentions.channels.first() || message.channel;
                await AIConfig.findOneAndUpdate(
                    { guildId: message.guild.id },
                    { channelId: targetChannel.id, enabled: true },
                    { upsert: true, new: true }
                );
                return message.reply(`⚡ **SparkCore AI Activated!**\nBound channel: <#${targetChannel.id}>. AI ab live hai!`);
            }

            if (sub === 'off' || sub === 'disable') {
                await AIConfig.findOneAndUpdate(
                    { guildId: message.guild.id },
                    { enabled: false },
                    { upsert: true, new: true }
                );
                conversationMemory.delete(`${message.guild.id}_${message.channel.id}`);
                return message.reply('⚠️ SparkCore AI disable kar diya gaya hai.');
            }

            if (sub === 'clear' || sub === 'reset') {
                conversationMemory.delete(`${message.guild.id}_${message.channel.id}`);
                return message.reply('🧹 AI channel memory clear ho chuki hai.');
            }

            return message.reply('ℹ️ **SparkCore AI Controls:**\n• `%ai set` - Current chat bind karo\n• `%ai clear` - Memory reset\n• `%ai off` - Disable');
        }

        // 2. CHECK CHAT TRIGGERS (Mention OR Dedicated AI Channel)
        const isMentioned = message.mentions.has(client.user.id) && !message.reference;
        const aiData = await AIConfig.findOne({ guildId: message.guild.id });
        const isAiChannel = aiData && aiData.enabled && message.channel.id === aiData.channelId;

        if (!isAiChannel && !isMentioned) return;

        if (!isBotOwner) {
            const featureEnabled = await isFeatureEnabled(message.guild.id, 'ai', message.author.id).catch(() => true);
            if (!featureEnabled) return;
        }

        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
            return message.reply('⚠️ `GROQ_API_KEY` set nahi hai Railway variables me!');
        }

        let userPrompt = message.content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
        if (!userPrompt) return message.reply('Boliye, main aapki kya madad kar sakta hoon?');

        await message.channel.sendTyping().catch(() => {});

        // Build Persona & System Rules
        let systemPrompt = `You are "SparkCore", an ultra-fast Discord AI assistant.
Language Rules:
- Speak strictly in crisp Hinglish (Hindi in Latin alphabet) or English.
- NEVER talk unnecessarily or give long lectures. Keep answers direct, punchy, and helpful.

Identity & Owners:
- FZBOY and FOUZAN are the EXACT same person (He/Him). He is your primary creator and Boss. Under NO condition use any other real name.
- DAREQUEEN is a respected female co-owner (She/Her).
- Current user talking: ${message.author.username} (ID:${message.author.id})
`;

        if (isBotOwner) {
            const info = OWNERS_INFO[message.author.id];
            systemPrompt += `\nCRITICAL CONTEXT: The user is your BOT OWNER: ${info.name}.
You act as their personal JARVIS. When they ask to send messages, DMs, clear chat, show demos, or generate images, call tools immediately. Address them naturally (e.g. "Ji FZBOY bhai" ya "Ji DAREQUEEN ma'am").`;
        } else {
            systemPrompt += `\nCRITICAL CONTEXT: Normal member. Do NOT execute administrative server tools for them. You can execute generate_image.`;
        }

        const memKey = `${message.guild.id}_${message.channel.id}`;
        let history = conversationMemory.get(memKey) || [];

        const messages = [{ role: 'system', content: systemPrompt }];
        for (const msg of history) {
            messages.push({
                role: msg.role === 'model' ? 'assistant' : 'user',
                content: String(msg.text)
            });
        }
        messages.push({ role: 'user', content: `${message.author.username}:${userPrompt}` });

        try {
            // Using llama-3.1-8b-instant for blazing fast & reliable tool execution
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'llama-3.1-8b-instant',
                    messages: messages,
                    tools: tools,
                    tool_choice: 'auto',
                    max_tokens: 500,
                    temperature: 0.6
                })
            });

            const data = await response.json();

            // Catch backend API errors directly
            if (!response.ok || data.error) {
                console.error('Groq API Error Response:', data);
                return message.reply(`⚠️ Groq API Error: \`${data.error?.message || 'Unknown Error'}\``);
            }

            const choice = data.choices && data.choices[0]?.message;
            if (!choice) {
                return message.reply('⚠️ Groq se valid response nahi aaya. Ek baar wapas bolo!');
            }

            // TOOL / JARVIS ACTIONS
            if (choice.tool_calls && choice.tool_calls.length > 0) {
                for (const tool of choice.tool_calls) {
                    const fn = tool.function.name;
                    let args = {};
                    try { args = JSON.parse(tool.function.arguments); } catch (_) {}

                    if (fn === 'send_channel_message') {
                        if (!isBotOwner && !message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
                            return message.reply('❌ Ye action sirf Owners kar sakte hain.');
                        }
                        const tChan = message.guild.channels.cache.get(args.channel_id?.replace(/[<#>]/g, ''));
                        if (tChan && tChan.isTextBased()) {
                            await tChan.send(args.content);
                            return message.reply(`✅ Message sent to <#${tChan.id}>!`);
                        } else {
                            return message.reply('❌ Target channel nahi mila.');
                        }
                    }

                    if (fn === 'send_user_dm') {
                        if (!isBotOwner) return message.reply('❌ DMs bhejna sirf Bot Owners ke liye allowed hai.');
                        const uId = args.user_id?.replace(/[<@!>]/g, '');
                        const targetUser = await client.users.fetch(uId).catch(() => null);
                        if (targetUser) {
                            try {
                                await targetUser.send(`📩 **Message from Server Staff:**\n${args.message}`);
                                return message.reply(`✅ DM successfully user <@${targetUser.id}> ko bhej diya.`);
                            } catch (_) {
                                return message.reply('❌ User ka DM band hai.');
                            }
                        } else {
                            return message.reply('❌ User ID invalid hai.');
                        }
                    }

                    if (fn === 'purge_messages') {
                        if (!isBotOwner && !message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
                            return message.reply('❌ Messages purge karne ki permission nahi hai.');
                        }
                        const amt = Math.min(Math.max(args.amount || 5, 1), 100);
                        await message.channel.bulkDelete(amt + 1, true).catch(() => {});
                        const m = await message.channel.send(`🧹 Cleared **${amt}** messages.`);
                        setTimeout(() => m.delete().catch(() => {}), 3000);
                        return;
                    }

                    if (fn === 'show_demo') {
                        if (args.feature === 'ticket') {
                            const demoEmbed = new EmbedBuilder()
                                .setColor('#5865F2')
                                .setTitle(`🎫 ${message.guild.name} Support System`)
                                .setDescription(`✨ **[DEMO PANEL]** Support desk ready.\nClick button to open ticket.`)
                                .setImage(DYNAMIC_BG_GIF)
                                .setFooter({ text: `${message.guild.name} • 1 Ticket Per User Limit` });
                            return message.channel.send({ embeds: [demoEmbed] });
                        } else {
                            const avatarUrl = encodeURIComponent(message.author.displayAvatarURL({ extension: 'png', size: 512 }));
                            const cardUrl = `https://api.popcat.xyz/welcomecard?background=${encodeURIComponent(DYNAMIC_BG_GIF)}&text1=${encodeURIComponent(message.author.username)}&text2=Welcome+to+${encodeURIComponent(message.guild.name)}&text3=Member+%23${message.guild.memberCount}&avatar=${avatarUrl}`;
                            const res = await fetch(cardUrl);
                            const arr = await res.arrayBuffer();
                            const attach = new AttachmentBuilder(Buffer.from(arr), { name: 'welcome-demo.png' });
                            return message.channel.send({ content: `✨ **[DEMO WELCOME]**`, files: [attach] });
                        }
                    }

                    if (fn === 'generate_image') {
                        const seed = Math.floor(Math.random() * 999999);
                        const imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(args.prompt)}?seed=${seed}&width=1024&height=1024&nologo=true`;
                        const embed = new EmbedBuilder()
                            .setColor('#9B59B6')
                            .setTitle('🎨 SparkCore AI Canvas')
                            .setDescription(`**Prompt:** ${args.prompt}\n*Created for:* <@${message.author.id}>`)
                            .setImage(imgUrl)
                            .setFooter({ text: 'SparkCore Neural Engine' });
                        return message.reply({ embeds: [embed] });
                    }
                }
            }

            // NORMAL TEXT RESPONSE
            const replyText = choice.content?.trim();
            if (replyText) {
                history.push({ role: 'user', text: `${message.author.username}:${userPrompt}` });
                history.push({ role: 'model', text: replyText });
                if (history.length > 8) history = history.slice(history.length - 8);
                conversationMemory.set(memKey, history);

                const chunks = replyText.match(/[\s\S]{1,1990}/g) || [replyText];
                for (const chunk of chunks) {
                    await message.reply({ content: chunk }).catch(() => {});
                }
            }
        } catch (err) {
            console.error('Groq AI Request Catch Error:', err);
            return message.reply(`⚠️ Connection issue: \`${err.message}\``);
        }
    });
};
