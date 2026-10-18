const AIConfig = require('../models/aiConfig');
const { isFeatureEnabled } = require('../utils/featureCheck');
const { 
    EmbedBuilder, 
    PermissionFlagsBits, 
    AttachmentBuilder, 
    ChannelType 
} = require('discord.js');

const BOT_OWNERS = [
    '1549995551288852584', // FZBOY
    '1266728371719508062', // FZBOY
    '1474216218792558735'  // DAREQUEEN
];

const OWNERS_INFO = {
    '1549995551288852584': { name: 'FZBOY', gender: 'male', title: 'Boss & Primary Creator' },
    '1266728371719508062': { name: 'FZBOY', gender: 'male', title: 'Boss & Primary Creator' },
    '1474216218792558735': { name: 'DAREQUEEN', gender: 'female', title: 'Supreme Co-Owner & Queen' }
};

const DYNAMIC_BG_GIF = 'https://cdn.discordapp.com/attachments/1540696710387335330/1561320565824819200/IMG_419c1bc5-8c2f-4a1d-bee2-12c277981844.gif?ex=6ad5ec96&is=6ad49b16&hm=01865ada94ac14828df2910ef44b3f34a65149323d5938feae3c1467674051e0&';
const conversationMemory = new Map();
let activeGroqModel = null;

// Dynamic model selector
async function getGroqModel(apiKey) {
    if (activeGroqModel) return activeGroqModel;
    try {
        const res = await fetch('https://api.groq.com/openai/v1/models', {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        const data = await res.json();
        if (data.data && Array.isArray(data.data)) {
            const llama = data.data.find(m => m.id.includes('llama-3.3-70b') || m.id.includes('llama-3.1-70b') || m.id.includes('llama3-70b') || m.id.includes('llama3-8b'));
            if (llama) {
                activeGroqModel = llama.id;
                return activeGroqModel;
            }
            if (data.data.length > 0) {
                activeGroqModel = data.data[0].id;
                return activeGroqModel;
            }
        }
    } catch (_) {}
    return 'llama-3.3-70b-versatile';
}

// Complete Autonomous Jarvis Tools
const tools = [
    // 1. Image Generation
    {
        type: 'function',
        function: {
            name: 'generate_image',
            description: 'Generate an AI photo/image from a visual description.',
            parameters: {
                type: 'object',
                properties: {
                    prompt: { type: 'string', description: 'Visual English prompt describing the image' }
                },
                required: ['prompt']
            }
        }
    },
    // 2. Channel Management
    {
        type: 'function',
        function: {
            name: 'manage_channel',
            description: 'Create, delete, rename, or lock/unlock channels.',
            parameters: {
                type: 'object',
                properties: {
                    action: { type: 'string', enum: ['create', 'delete', 'rename', 'lock', 'unlock'] },
                    channel_name: { type: 'string', description: 'Name of channel to create or rename' },
                    channel_type: { type: 'string', enum: ['text', 'voice'], description: 'Text or Voice channel' },
                    target_channel_id: { type: 'string', description: 'ID of channel to modify/delete/lock' }
                },
                required: ['action']
            }
        }
    },
    // 3. Role Management
    {
        type: 'function',
        function: {
            name: 'manage_role',
            description: 'Create, delete, assign, or remove roles for members.',
            parameters: {
                type: 'object',
                properties: {
                    action: { type: 'string', enum: ['create', 'delete', 'add_to_user', 'remove_from_user'] },
                    role_name: { type: 'string', description: 'Name of the role' },
                    role_color: { type: 'string', description: 'HEX color code (e.g. #FF0000)' },
                    role_id: { type: 'string', description: 'ID of target role' },
                    user_id: { type: 'string', description: 'Target user ID' }
                },
                required: ['action']
            }
        }
    },
    // 4. Moderation Actions
    {
        type: 'function',
        function: {
            name: 'moderate_member',
            description: 'Timeout, kick, or ban a user from the server.',
            parameters: {
                type: 'object',
                properties: {
                    action: { type: 'string', enum: ['timeout', 'kick', 'ban'] },
                    user_id: { type: 'string', description: 'Target user ID or mention' },
                    duration_minutes: { type: 'number', description: 'Minutes for timeout (e.g. 10)' },
                    reason: { type: 'string', description: 'Audit log reason' }
                },
                required: ['action', 'user_id']
            }
        }
    },
    // 5. Server Analytics & Online Counts
    {
        type: 'function',
        function: {
            name: 'get_server_stats',
            description: 'Get member status counts: total members, online, idle, dnd, bots, channels.',
            parameters: { type: 'object', properties: {} }
        }
    },
    // 6. Gift / Redeem Codes
    {
        type: 'function',
        function: {
            name: 'generate_gift_codes',
            description: 'Generate custom redeem or nitro-style gift keys.',
            parameters: {
                type: 'object',
                properties: {
                    count: { type: 'number', description: 'Number of codes to generate (max 10)' },
                    title: { type: 'string', description: 'Type or tag of the gift' }
                },
                required: ['count']
            }
        }
    },
    // 7. Direct DMs
    {
        type: 'function',
        function: {
            name: 'send_user_dm',
            description: 'Send direct DM to a user via bot.',
            parameters: {
                type: 'object',
                properties: {
                    user_id: { type: 'string', description: 'Target user ID' },
                    message: { type: 'string', description: 'Message to DM' }
                },
                required: ['user_id', 'message']
            }
        }
    },
    // 8. Purge Chat
    {
        type: 'function',
        function: {
            name: 'purge_messages',
            description: 'Purge messages from current channel.',
            parameters: {
                type: 'object',
                properties: {
                    amount: { type: 'number', description: '1-100 count' }
                },
                required: ['amount']
            }
        }
    },
    // 9. Demos
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
    }
];

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        if (!message.guild || message.author.bot) return;

        const content = message.content.trim();
        const isBotOwner = BOT_OWNERS.includes(message.author.id);
        const isServerOwner = message.author.id === message.guild.ownerId;
        const isAdmin = message.member?.permissions.has(PermissionFlagsBits.Administrator);

        // 1. SETUP COMMANDS (%ai set, %ai clear, %ai off)[span_8](start_span)[span_8](end_span)
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

        // 2. TRIGGER CHECKS
        const isMentioned = message.mentions.has(client.user.id) && !message.reference;
        const aiData = await AIConfig.findOne({ guildId: message.guild.id });
        const isAiChannel = aiData && aiData.enabled && message.channel.id === aiData.channelId;

        if (!isAiChannel && !isMentioned) return;

        if (!isBotOwner) {
            const featureEnabled = await isFeatureEnabled(message.guild.id, 'ai', message.author.id).catch(() => true);
            if (!featureEnabled) return;
        }

        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) return message.reply('⚠️ `GROQ_API_KEY` missing hai!');

        let userPrompt = message.content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
        if (!userPrompt) return message.reply('Boliye, main aapki kya madad kar sakta hoon?');

        await message.channel.sendTyping().catch(() => {});

        // Fetch Server Owner Details
        let serverOwnerTag = 'Unknown';
        try {
            const sOwner = await message.guild.fetchOwner();
            if (sOwner) serverOwnerTag = sOwner.user.username;
        } catch (_) {}

        // System Instruction & Identity Rules
        let systemPrompt = `You are "SparkCore", an ultra-intelligent, fast, autonomous Discord Jarvis assistant.
Language Rules:
- Communicate in crisp Hinglish (Hindi written in Latin characters) or natural modern English.
- Avoid unnecessary essays or robotic textbook talks. Be sharp, efficient, and direct.

Server Identity & Owners:
- FZBOY and FOUZAN are the EXACT same person (He/Him). He is your primary creator, developer, and supreme Boss.
- DAREQUEEN is a respected female co-owner (She/Her).
- Server Owner of this server (${message.guild.name}) is: ${serverOwnerTag} (ID:${message.guild.ownerId}).
- Current User: ${message.author.username} (ID:${message.author.id})
`;

        if (isBotOwner) {
            const info = OWNERS_INFO[message.author.id];
            systemPrompt += `\nCRITICAL CONTEXT: The user talking to you is SUPREME BOT OWNER: ${info.name} (${info.title}).
You are their personal JARVIS with zero-restriction server control. Execute any requested tool immediately (channels, roles, timeouts, kicks, bans, gifts, DMs, purges, stats). Address them with natural Boss reverence (e.g., "Ji Boss", "Ji FZBOY bhai", ya "Ji DAREQUEEN ma'am").`;
        } else if (isServerOwner) {
            systemPrompt += `\nCRITICAL CONTEXT: The user is the SERVER OWNER of this guild (${serverOwnerTag}).
Address them with respect as "Server Owner" or "Guild Master". You can execute moderation, stats, channel management, and image generation for them inside this server.`;
        } else {
            systemPrompt += `\nCRITICAL CONTEXT: Normal member. Do NOT execute administrative server tools (roles, channels, moderation, DMs) for them. You can help them with information, stats, and generate_image.`;
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
            const currentModel = await getGroqModel(apiKey);

            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: currentModel,
                    messages: messages,
                    tools: tools,
                    tool_choice: 'auto',
                    max_tokens: 600,
                    temperature: 0.6
                })
            });

            const data = await response.json();
            if (!response.ok || data.error) {
                activeGroqModel = null;
                return message.reply(`⚠️ Groq API Error: \`${data.error?.message || 'Unknown'}\``);
            }

            const choice = data.choices && data.choices[0]?.message;
            if (!choice) return message.reply('⚠️ Response receive nahi hua.');

            // TOOL EXECUTION MATRIX
            if (choice.tool_calls && choice.tool_calls.length > 0) {
                for (const tool of choice.tool_calls) {
                    const fn = tool.function.name;
                    let args = {};
                    try { args = JSON.parse(tool.function.arguments); } catch (_) {}

                    // 1. Channel Management
                    if (fn === 'manage_channel') {
                        if (!isBotOwner && !isServerOwner && !message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
                            return message.reply('❌ Channel permissions manage karne ki permission nahi hai.');
                        }

                        if (args.action === 'create') {
                            const type = args.channel_type === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText;
                            const created = await message.guild.channels.create({
                                name: args.channel_name || 'new-channel',
                                type: type
                            }).catch(err => { throw new Error(err.message); });
                            return message.reply(`✅ Done! Naya channel create ho gaya: <#${created.id}>`);
                        }

                        if (args.action === 'delete') {
                            const tChan = message.guild.channels.cache.get(args.target_channel_id?.replace(/[<#>]/g, '')) || message.channel;
                            const cName = tChan.name;
                            await tChan.delete().catch(err => { throw new Error(err.message); });
                            return message.channel.id !== tChan.id ? message.reply(`🗑️ Channel \`#${cName}\` delete ho gaya.`) : null;
                        }

                        if (args.action === 'rename') {
                            const tChan = message.guild.channels.cache.get(args.target_channel_id?.replace(/[<#>]/g, '')) || message.channel;
                            await tChan.setName(args.channel_name).catch(err => { throw new Error(err.message); });
                            return message.reply(`✏️ Channel ka naam rename ho kar \`${args.channel_name}\` ho gaya!`);
                        }

                        if (args.action === 'lock') {
                            const tChan = message.guild.channels.cache.get(args.target_channel_id?.replace(/[<#>]/g, '')) || message.channel;
                            await tChan.permissionOverwrites.edit(message.guild.id, { SendMessages: false });
                            return message.reply(`🔒 Channel <#${tChan.id}> lockdown mode me chala gaya hai.`);
                        }

                        if (args.action === 'unlock') {
                            const tChan = message.guild.channels.cache.get(args.target_channel_id?.replace(/[<#>]/g, '')) || message.channel;
                            await tChan.permissionOverwrites.edit(message.guild.id, { SendMessages: true });
                            return message.reply(`🔓 Channel <#${tChan.id}> unlock ho gaya hai.`);
                        }
                    }

                    // 2. Role Management
                    if (fn === 'manage_role') {
                        if (!isBotOwner && !isServerOwner && !message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
                            return message.reply('❌ Roles manage karne ki permission nahi hai.');
                        }

                        if (args.action === 'create') {
                            const role = await message.guild.roles.create({
                                name: args.role_name || 'New Role',
                                color: args.role_color || '#5865F2'
                            }).catch(err => { throw new Error(err.message); });
                            return message.reply(`✅ Role **${role.name}** create ho chuki hai!`);
                        }

                        if (args.action === 'add_to_user') {
                            const targetMember = await message.guild.members.fetch(args.user_id?.replace(/[<@!>]/g, '')).catch(() => null);
                            const role = message.guild.roles.cache.get(args.role_id?.replace(/[<@&>]/g, '')) || message.guild.roles.cache.find(r => r.name.toLowerCase() === args.role_name?.toLowerCase());
                            if (targetMember && role) {
                                await targetMember.roles.add(role);
                                return message.reply(`✅ Role **${role.name}** user <@${targetMember.id}> ko de di gayi hai!`);
                            }
                            return message.reply('❌ User ya Role nahi mila.');
                        }

                        if (args.action === 'remove_from_user') {
                            const targetMember = await message.guild.members.fetch(args.user_id?.replace(/[<@!>]/g, '')).catch(() => null);
                            const role = message.guild.roles.cache.get(args.role_id?.replace(/[<@&>]/g, '')) || message.guild.roles.cache.find(r => r.name.toLowerCase() === args.role_name?.toLowerCase());
                            if (targetMember && role) {
                                await targetMember.roles.remove(role);
                                return message.reply(`✅ Role **${role.name}** user <@${targetMember.id}> se remove ho gayi!`);
                            }
                            return message.reply('❌ User ya Role nahi mila.');
                        }

                        if (args.action === 'delete') {
                            const role = message.guild.roles.cache.get(args.role_id?.replace(/[<@&>]/g, '')) || message.guild.roles.cache.find(r => r.name.toLowerCase() === args.role_name?.toLowerCase());
                            if (role) {
                                const rName = role.name;
                                await role.delete();
                                return message.reply(`🗑️ Role \`${rName}\` delete kar di gayi hai.`);
                            }
                            return message.reply('❌ Role nahi mili.');
                        }
                    }

                    // 3. Moderation (Timeout, Kick, Ban)
                    if (fn === 'moderate_member') {
                        if (!isBotOwner && !isServerOwner && !message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
                            return message.reply('❌ Moderation commands ke liye permission required hai.');
                        }

                        const targetMember = await message.guild.members.fetch(args.user_id?.replace(/[<@!>]/g, '')).catch(() => null);
                        if (!targetMember) return message.reply('❌ Target member nahi mila.');

                        if (args.action === 'timeout') {
                            const mins = args.duration_minutes || 5;
                            await targetMember.timeout(mins * 60 * 1000, args.reason || 'AI Jarvis Moderation');
                            return message.reply(`⏳ <@${targetMember.id}> ko **${mins} minutes** ke liye timeout par daal diya gaya hai!`);
                        }

                        if (args.action === 'kick') {
                            await targetMember.kick(args.reason || 'AI Jarvis Moderation');
                            return message.reply(`👢 User **${targetMember.user.tag}** ko kick kar diya gaya.`);
                        }

                        if (args.action === 'ban') {
                            await targetMember.ban({ reason: args.reason || 'AI Jarvis Moderation' });
                            return message.reply(`🔨 User **${targetMember.user.tag}** ko ban kar diya gaya.`);
                        }
                    }

                    // 4. Server Stats & Presence Counts
                    if (fn === 'get_server_stats') {
                        const total = message.guild.memberCount;
                        const members = message.guild.members.cache;
                        const bots = members.filter(m => m.user.bot).size;
                        const humans = total - bots;

                        // Accurate presence counters
                        let online = 0, idle = 0, dnd = 0;
                        members.forEach(m => {
                            const status = m.presence?.status;
                            if (status === 'online') online++;
                            else if (status === 'idle') idle++;
                            else if (status === 'dnd') dnd++;
                        });

                        const statsEmbed = new EmbedBuilder()
                            .setColor('#00FFAA')
                            .setTitle(`📊 Server Analytics: ${message.guild.name}`)
                            .setThumbnail(message.guild.iconURL({ size: 1024 }))
                            .addFields(
                                { name: '👥 Total Members', value: `\`${total}\` (Humans: \`${humans}\`, Bots: \`${bots}\`)`, inline: false },
                                { name: '🟢 Online Activity', value: `Online: \`${online}\` | Idle: \`${idle}\` | DND: \`${dnd}\``, inline: false },
                                { name: '📁 Channels', value: `\`${message.guild.channels.cache.size}\` Channels`, inline: true },
                                { name: '🏷️ Roles', value: `\`${message.guild.roles.cache.size}\` Roles`, inline: true },
                                { name: '👑 Server Owner', value: `<@${message.guild.ownerId}>`, inline: true }
                            )
                            .setTimestamp();

                        return message.reply({ embeds: [statsEmbed] });
                    }

                    // 5. Custom Gift / Redeem Codes
                    if (fn === 'generate_gift_codes') {
                        const count = Math.min(Math.max(args.count || 1, 1), 10);
                        const codes = [];
                        for (let i = 0; i < count; i++) {
                            const part1 = Math.random().toString(36).substring(2, 6).toUpperCase();
                            const part2 = Math.random().toString(36).substring(2, 6).toUpperCase();
                            const part3 = Math.random().toString(36).substring(2, 6).toUpperCase();
                            codes.push(`SPARK-${part1}-${part2}-${part3}`);
                        }

                        const codeEmbed = new EmbedBuilder()
                            .setColor('#FF007F')
                            .setTitle(`🎁 Generated Gift Codes (${count})`)
                            .setDescription(codes.map(c => `• \`${c}\``).join('\n'))
                            .setFooter({ text: 'SparkCore Autonomous Key Vault' });

                        return message.reply({ embeds: [codeEmbed] });
                    }

                    // 6. Direct User DM
                    if (fn === 'send_user_dm') {
                        if (!isBotOwner) return message.reply('❌ DMs bhejna sirf Bot Owners ke liye allowed hai.');
                        const uId = args.user_id?.replace(/[<@!>]/g, '');
                        const targetUser = await client.users.fetch(uId).catch(() => null);
                        if (targetUser) {
                            try {
                                await targetUser.send(`📩 **Direct Transmission from SparkCore Staff:**\n${args.message}`);
                                return message.reply(`✅ DM successfully user <@${targetUser.id}> ko send ho gaya!`);
                            } catch (_) {
                                return message.reply('❌ User ka DM closed hai.');
                            }
                        }
                        return message.reply('❌ User ID invalid hai.');
                    }

                    // 7. Purge
                    if (fn === 'purge_messages') {
                        if (!isBotOwner && !isServerOwner && !message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
                            return message.reply('❌ Messages purge karne ki permission nahi hai.');
                        }
                        const amt = Math.min(Math.max(args.amount || 5, 1), 100);
                        await message.channel.bulkDelete(amt + 1, true).catch(() => {});
                        const m = await message.channel.send(`🧹 Cleared **${amt}** messages.`);
                        setTimeout(() => m.delete().catch(() => {}), 3000);
                        return;
                    }

                    // 8. Demo Views
                    if (fn === 'show_demo') {
                        if (args.feature === 'ticket') {
                            const demoEmbed = new EmbedBuilder()
                                .setColor('#5865F2')
                                .setTitle(`🎫 ${message.guild.name} Support System`)
                                .setDescription(`✨ **[DEMO PANEL]** Ticket demo ready.`)
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

                    // 9. AI Image Generation
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

            // Normal Text Response
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
            activeGroqModel = null;
            return message.reply(`⚠️ Connection issue: \`${err.message}\``);
        }
    });

    console.log('✔ SparkCore Native Jarvis AI Engine loaded.');
};
