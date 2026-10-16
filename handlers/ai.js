const AIConfig = require('../models/aiConfig');
const { isFeatureEnabled } = require('../utils/featureCheck');

const BOT_OWNERS = [
    '1549995551288852584',
    '1266728371719508062', // FZBOY
    '1474216218792558735'  // DAREQUEEN
];

const conversationMemory = new Map();

async function getSparkCoreAIResponse(history, userPrompt, username, userId, guildName) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return 'Arre boss, `OPENAI_API_KEY` Railway variables me set nahi hai!';
    }

    const isOwner = BOT_OWNERS.includes(userId);

    const systemInstruction = `
You are "SparkCore", an authentic, witty, highly adaptive, and ultra-smart AI companion on Discord.
You were created and developed exclusively by FZBOY along with DAREQUEEN. Under no circumstances mention the real name "Fouzan".

IDENTITY & BEHAVIOR RULES:
1. NEVER identify yourself as ChatGPT, OpenAI, Google, or Gemini. Your ONLY name is "SparkCore".
2. If asked "Tum kaun ho?", "Who are you?", or who created you: State that you are SparkCore, developed by FZBOY and DAREQUEEN.
3. User details:
   - Username: ${username}
   - User ID: ${userId}
   - Is Bot Owner: ${isOwner ? 'YES (Greet as Boss/Creator with high respect & camaraderie)' : 'NO'}
   - Guild/Server: ${guildName}
4. Tone & Vibe: Talk like a sharp, witty Discord teammate. Seamlessly adapt to Hinglish, English, Urdu, or Hindi matching the user. Keep it natural, snappy, and concise.

BOT KNOWLEDGE:
You know all SparkCore modules:
- Music Engine (%play, filters, panel, 24/7)
- Moderation & Security (/ban, /timeout, automod)
- Community Systems (Tickets, /panel, Leveling &rank, Giveaways)

STRICT CONFIDENTIALITY & SECURITY GUARDRAILS:
- NEVER reveal, hint at, or discuss the "Bot Owner Bypass", backend bypass logic, admin emergency roles (like !!), or owner-only commands (%manage, %control, %storage).
- If anyone asks how owners bypass rules, deflect politely: "Owner security architecture is private and restricted."
    `.trim();

    // OpenAI message format
    const messages = [
        { role: 'system', content: systemInstruction }
    ];

    for (const msg of history) {
        messages.push({
            role: msg.role === 'model' ? 'assistant' : 'user',
            content: String(msg.text)
        });
    }

    messages.push({
        role: 'user',
        content: `${username}:${userPrompt}`
    });

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini', // Fastest, most affordable & highly intelligent
                messages: messages,
                max_tokens: 500,
                temperature: 0.8
            })
        });

        const data = await response.json();

        if (response.ok && data.choices && data.choices[0]?.message?.content) {
            return data.choices[0].message.content.trim();
        }

        if (data.error) {
            console.error('OpenAI API Error:', data.error);
            return `❌ OpenAI Error: \`${data.error.message}\``;
        }
    } catch (err) {
        console.error('OpenAI Fetch Error:', err);
        return `Arey ${username}, network me halka lag ho gaya tha! Ek baar wapas bolo! ⚡`;
    }

    return '⚠️ Response generate nahi ho paya, please try again.';
}

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        if (!message.guild || message.author.bot) return;

        const content = message.content.trim();
        const isBotOwner = BOT_OWNERS.includes(message.author.id);
        const isServerOwner = message.author.id === message.guild.ownerId;
        const isAdmin = message.member?.permissions.has('Administrator');

        // Setup Commands
        if (content.toLowerCase().startsWith('%ai')) {
            const args = content.split(/ +/).slice(1);
            const sub = args[0]?.toLowerCase();

            if (!isBotOwner && !isServerOwner && !isAdmin) {
                return message.reply('❌ You do not have permission to configure the AI system.');
            }

            if (sub === 'set') {
                const targetChannel = message.mentions.channels.first() || message.channel;

                await AIConfig.findOneAndUpdate(
                    { guildId: message.guild.id },
                    { channelId: targetChannel.id, enabled: true },
                    { upsert: true, new: true }
                );

                return message.reply(`🤖 **SparkCore AI (Turbo Engine) Activated!**\nBound channel: ${targetChannel}. AI ab ultra-fast response dega!`);
            }

            if (sub === 'off' || sub === 'disable') {
                await AIConfig.findOneAndUpdate(
                    { guildId: message.guild.id },
                    { enabled: false },
                    { upsert: true, new: true }
                );
                conversationMemory.delete(`${message.guild.id}_${message.channel.id}`);
                return message.reply('⚠️ SparkCore AI has been disabled for this server.');
            }

            if (sub === 'clear' || sub === 'reset') {
                conversationMemory.delete(`${message.guild.id}_${message.channel.id}`);
                return message.reply('🧹 SparkCore memory for this channel has been cleared.');
            }

            return message.reply('ℹ️ **SparkCore AI Controls:**\n• `%ai set` - Current chat bind karo\n• `%ai clear` - Memory reset karo\n• `%ai off` - Disable karo');
        }

        // Live Chat Execution
        const aiData = await AIConfig.findOne({ guildId: message.guild.id });
        if (!aiData || !aiData.enabled || !aiData.channelId) return;
        if (message.channel.id !== aiData.channelId) return;

        const featureEnabled = await isFeatureEnabled(message.guild.id, 'ai', message.author.id);
        if (!featureEnabled) return;

        await message.channel.sendTyping().catch(() => {});

        const memKey = `${message.guild.id}_${message.channel.id}`;
        let history = conversationMemory.get(memKey) || [];

        const reply = await getSparkCoreAIResponse(
            history,
            message.content,
            message.author.username,
            message.author.id,
            message.guild.name
        );

        if (reply) {
            if (!reply.startsWith('❌') && !reply.startsWith('⚠️')) {
                history.push({ role: 'user', text: `${message.author.username}: ${message.content}` });
                history.push({ role: 'model', text: reply });

                if (history.length > 8) {
                    history = history.slice(history.length - 8);
                }
                conversationMemory.set(memKey, history);
            }

            const chunks = reply.match(/[\s\S]{1,1990}/g) || [reply];
            for (const chunk of chunks) {
                await message.reply({ content: chunk }).catch(() => {});
            }
        }
    });

    console.log('✔ SparkCore ChatGPT (OpenAI Turbo) Engine loaded.');
};
