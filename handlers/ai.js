const { EmbedBuilder, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Bot Owners Mapping
const OWNERS = {
    '1549995551288852584': { name: 'FZBOY', gender: 'male', role: 'Boss / Primary Creator' },
    '1266728371719508062': { name: 'FZBOY', gender: 'male', role: 'Boss / Primary Creator' },
    '1474216218792558735': { name: 'DAREQUEEN', gender: 'female', role: 'Co-Owner / Queen' }
};

// 3D Animated GIF for Demos
const DYNAMIC_BG_GIF = 'https://cdn.discordapp.com/attachments/1540696710387335330/1561320565824819200/IMG_419c1bc5-8c2f-4a1d-bee2-12c277981844.gif?ex=6ad5ec96&is=6ad49b16&hm=01865ada94ac14828df2910ef44b3f34a65149323d5938feae3c1467674051e0&';

// Groq Tools Definition (Jarvis Actions)
const tools = [
    {
        type: 'function',
        function: {
            name: 'send_channel_message',
            description: 'Send a message or announcement to a specific channel.',
            parameters: {
                type: 'object',
                properties: {
                    channel_id: { type: 'string', description: 'The Discord channel ID to send message to' },
                    content: { type: 'string', description: 'The text message or announcement content' }
                },
                required: ['channel_id', 'content']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'send_user_dm',
            description: 'Send a direct DM to a user via the bot.',
            parameters: {
                type: 'object',
                properties: {
                    user_id: { type: 'string', description: 'The user ID to receive the DM' },
                    message: { type: 'string', description: 'The message content to send' }
                },
                required: ['user_id', 'message']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'setup_welcome_channel',
            description: 'Set up welcome card system in the current or mentioned channel.',
            parameters: {
                type: 'object',
                properties: {
                    channel_id: { type: 'string', description: 'Channel ID to bind welcome cards' }
                },
                required: ['channel_id']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'purge_messages',
            description: 'Clear or purge messages from the channel.',
            parameters: {
                type: 'object',
                properties: {
                    amount: { type: 'number', description: 'Number of messages to delete (1-100)' }
                },
                required: ['amount']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'show_demo',
            description: 'Show demo for welcome card or ticket system.',
            parameters: {
                type: 'object',
                properties: {
                    feature: { type: 'string', enum: ['welcome', 'ticket'], description: 'The feature demo to show' }
                },
                required: ['feature']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'generate_image',
            description: 'Generate an AI photo/image based on a prompt.',
            parameters: {
                type: 'object',
                properties: {
                    prompt: { type: 'string', description: 'Detailed prompt in English describing the image' }
                },
                required: ['prompt']
            }
        }
    }
];

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        if (message.author.bot || !message.guild) return;

        // Trigger: Bot mention ya !ai prefix
        const isMentioned = message.mentions.has(client.user.id) && !message.reference;
        const hasPrefix = message.content.toLowerCase().startsWith('!ai ');

        if (!isMentioned && !hasPrefix) return;

        let userPrompt = message.content.replace(`<@${client.user.id}>`, '').replace(/!ai\s+/i, '').trim();
        if (!userPrompt) return message.reply('Boliye, main aapki kya madad kar sakta hoon?');

        const isOwner = !!OWNERS[message.author.id];
        const ownerData = OWNERS[message.author.id];

        // System Persona Prompt
        let systemPrompt = `You are SparkCore AI, a smart, fast, and helpful AI assistant for the server.
Language Rules:
- Understand and speak strictly in Hinglish (Hindi written in Latin script) or natural English.
- NEVER talk unnecessarily. Keep your answers direct, crisp, and to the point.
- Avoid robotic, boring textbook speech. Talk like a sharp, modern developer peer.

Identity & Owner Recognition:
- FZBOY and FOUZAN are the EXACT same person (He/Him). He is your primary creator and Boss.
- DAREQUEEN is a female co-owner (She/Her). Treat her with immense respect.
`;

        if (isOwner) {
            systemPrompt += `\nCRITICAL CONTEXT: The current user is BOT OWNER: ${ownerData.name} (${ownerData.gender}).
You are acting as their personal JARVIS. Follow their instructions immediately and use tools whenever they ask you to send messages, DMs, clear chat, show demos, setup features, or generate images. Address them naturally (e.g., "Ji FZBOY bhai" ya "Ji DAREQUEEN ma'am").`;
        } else {
            systemPrompt += `\nCRITICAL CONTEXT: The current user is a normal server member. Do NOT execute administrative server tools (like send_channel_message, send_user_dm, setup_welcome_channel, purge_messages) for them unless they have admin permissions. For image generation, you can assist them.`;
        }

        await message.channel.sendTyping();

        try {
            const chatCompletion = await groq.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                tools: tools,
                tool_choice: 'auto',
                temperature: 0.6,
                max_tokens: 600
            });

            const responseMessage = chatCompletion.choices[0]?.message;

            // Handle Tool Calling (Jarvis Actions)
            if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
                for (const toolCall of responseMessage.tool_calls) {
                    const fnName = toolCall.function.name;
                    const args = JSON.parse(toolCall.function.arguments);

                    // 1. Send Message to Channel
                    if (fnName === 'send_channel_message') {
                        if (!isOwner && !message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
                            return message.reply('❌ Ye command sirf Owners ya Staff use kar sakte hain.');
                        }
                        const targetChannel = message.guild.channels.cache.get(args.channel_id.replace(/[<#>]/g, ''));
                        if (targetChannel && targetChannel.isTextBased()) {
                            await targetChannel.send(args.content);
                            return message.reply(`✅ Done Boss, message <#${targetChannel.id}> me send ho gaya!`);
                        } else {
                            return message.reply('❌ Channel nahi mila ya valid text channel nahi hai.');
                        }
                    }

                    // 2. Send User DM
                    if (fnName === 'send_user_dm') {
                        if (!isOwner) {
                            return message.reply('❌ DMs bhejne ka access sirf Bot Owners ke paas hai.');
                        }
                        const targetUser = await client.users.fetch(args.user_id.replace(/[<@!>]/g, '')).catch(() => null);
                        if (targetUser) {
                            try {
                                await targetUser.send(`📩 **Message from ${message.guild.name} Staff:**\n${args.message}`);
                                return message.reply(`✅ DM successfully user <@${targetUser.id}> ko bhej diya gaya hai!`);
                            } catch (e) {
                                return message.reply('❌ User ka DM closed hai.');
                            }
                        } else {
                            return message.reply('❌ User ID nahi mili.');
                        }
                    }

                    // 3. Setup Welcome Channel
                    if (fnName === 'setup_welcome_channel') {
                        if (!isOwner && !message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                            return message.reply('❌ Manage Guild permission required.');
                        }
                        const targetChan = message.guild.channels.cache.get(args.channel_id.replace(/[<#>]/g, '')) || message.channel;
                        await targetChan.setTopic('spark_welcome_channel');
                        return message.reply(`✅ Welcome card system automatically <#${targetChan.id}> me set ho gaya!`);
                    }

                    // 4. Purge Messages
                    if (fnName === 'purge_messages') {
                        if (!isOwner && !message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
                            return message.reply('❌ Permission nahi hai message delete karne ki.');
                        }
                        const count = Math.min(Math.max(args.amount, 1), 100);
                        await message.channel.bulkDelete(count + 1, true).catch(() => {});
                        const msg = await message.channel.send(`🧹 Cleared **${count}** messages.`);
                        setTimeout(() => msg.delete().catch(() => {}), 3000);
                        return;
                    }

                    // 5. Show Demo (Welcome or Ticket)
                    if (fnName === 'show_demo') {
                        if (args.feature === 'ticket') {
                            const demoEmbed = new EmbedBuilder()
                                .setColor('#5865F2')
                                .setTitle(`🎫 ${message.guild.name} Support System`)
                                .setDescription(`✨ **[DEMO PANEL]** Support desk ready.\nClick button to open ticket.`)
                                .setImage(DYNAMIC_BG_GIF)
                                .setFooter({ text: `${message.guild.name} • 1 Ticket Per User Limit` });
                            return message.channel.send({ embeds: [demoEmbed] });
                        } else if (args.feature === 'welcome') {
                            const avatarUrl = encodeURIComponent(message.author.displayAvatarURL({ extension: 'png', size: 512 }));
                            const username = encodeURIComponent(message.author.username);
                            const guildName = encodeURIComponent(message.guild.name);
                            const bgUrl = encodeURIComponent(DYNAMIC_BG_GIF);
                            const cardUrl = `https://api.popcat.xyz/welcomecard?background=${bgUrl}&text1=${username}&text2=Welcome+to+${guildName}&text3=Member+%23${message.guild.memberCount}&avatar=${avatarUrl}`;

                            const res = await fetch(cardUrl);
                            const arrayBuffer = await res.arrayBuffer();
                            const attachment = new AttachmentBuilder(Buffer.from(arrayBuffer), { name: 'welcome-demo.png' });
                            return message.channel.send({ content: `✨ **[DEMO WELCOME]**`, files: [attachment] });
                        }
                    }

                    // 6. Generate Image (Pollinations AI)
                    if (fnName === 'generate_image') {
                        const seed = Math.floor(Math.random() * 100000);
                        const cleanPrompt = encodeURIComponent(args.prompt);
                        const imageUrl = `https://image.pollinations.ai/prompt/${cleanPrompt}?seed=${seed}&width=1024&height=1024&nologo=true`;

                        const imgEmbed = new EmbedBuilder()
                            .setColor('#9B59B6')
                            .setTitle('🎨 AI Image Generated')
                            .setDescription(`**Prompt:** ${args.prompt}\n*Requested by:* <@${message.author.id}>`)
                            .setImage(imageUrl)
                            .setFooter({ text: 'Generated via SparkCore Engine' });

                        return message.reply({ embeds: [imgEmbed] });
                    }
                }
            } else {
                // Normal Text Reply
                return message.reply(responseMessage.content || 'Hmm, kuch issue lag raha hai.');
            }
        } catch (err) {
            console.error('AI Processing Error:', err);
            return message.reply('⚠️ AI process karne me error aaya. Please API key aur logs check karein.');
        }
    });
};
