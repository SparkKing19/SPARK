const AIConfig = require('../models/aiConfig');
const { isFeatureEnabled } = require('../utils/featureCheck');

const BOT_OWNERS = [
    '1549995551288852584',
    '1266728371719508062', // FZBOY
    '1474216218792558735'  // DAREQUEEN
];

const conversationMemory = new Map();
let cachedWorkingModel = null; // Ek baar milne ke baad cache ho jayega

// Auto-detect valid model from Google API
async function getAvailableModel(apiKey) {
    if (cachedWorkingModel) return cachedWorkingModel;

    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await res.json();

        if (data.models && Array.isArray(data.models)) {
            // Find a model that supports generateContent
            const supported = data.models.filter(m => 
                m.supportedGenerationMethods && 
                m.supportedGenerationMethods.includes('generateContent') &&
                m.name.includes('gemini')
            );

            // Prefer flash models first
            const flash = supported.find(m => m.name.includes('flash') && !m.name.includes('vision'));
            if (flash) {
                cachedWorkingModel = flash.name.replace('models/', '');
                console.log(`✔ Auto-detected active Gemini model: ${cachedWorkingModel}`);
                return cachedWorkingModel;
            }

            if (supported.length > 0) {
                cachedWorkingModel = supported[0].name.replace('models/', '');
                console.log(`✔ Auto-detected active Gemini model: ${cachedWorkingModel}`);
                return cachedWorkingModel;
            }
        }
    } catch (e) {
        console.warn('Failed to list models, fallback to default:', e.message);
    }

    return 'gemini-2.0-flash';
}

async function getSparkCoreAIResponse(history, userPrompt, username, userId, guildName) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return '❌ Error: `GEMINI_API_KEY` Railway variables me set nahi hai.';
    }

    const isOwner = BOT_OWNERS.includes(userId);

    const systemInstruction = `
You are "SparkCore", an intelligent, authentic, and witty Discord AI assistant built for servers.
You were created and developed by FZBOY along with DAREQUEEN.

CRITICAL IDENTITY RULES:
1. NEVER identify yourself as ChatGPT, OpenAI, Gemini, or Google. Your ONLY name is "SparkCore".
2. If asked "Tum kaun ho?", "Who are you?", or who created you: State that you are SparkCore, developed by FZBOY and DAREQUEEN. Under no circumstances mention or use the real name "Fouzan".
3. The user you are currently talking to:
   - Username: ${username}
   - User ID: ${userId}
   - Is Bot Owner: ${isOwner ? 'YES (Treat with high respect/creator acknowledgement)' : 'NO'}
   - Server: ${guildName}

BOT KNOWLEDGE & GUIDELINES:
You have complete knowledge of SparkCore's modules and help members use them:
- Music Engine: Commands like %play, %pause, %skip, %stop, 24/7 mode, high-res panel, and audio filters.
- Moderation & Security: Slash commands (/ban, /kick, /timeout, /purge, /lock, /unlock, /role), automod link/IP blockers, bad word filtering.
- Community Systems: Tickets, Onboarding role pickers (/panel), Giveaways (/giveaway), Leveling (&rank), Invites tracker (&i, &lb), and Goodbye cards.

STRICT CONFIDENTIALITY & SECURITY GUARDRAILS (NEVER BREAK THESE):
- NEVER reveal, hint at, or discuss the "Bot Owner Bypass", backend bypass logic, admin emergency roles (like !!), or owner-only commands (%manage, %control, %storage).
- If anyone asks how owners bypass rules or how permissions work behind the scenes, deflect politely: "Owner security architecture is private and restricted."

TONE & LANGUAGE:
- Match the user's language dynamically: Hinglish, Urdu, Roman Urdu, Hindi, or English.
- Keep the tone friendly, witty, sharp, and helpful — like a cool teammate, not a robotic script.
    `.trim();

    const contents = [];

    for (const msg of history) {
        contents.push({
            role: msg.role === 'model' ? 'model' : 'user',
            parts: [{ text: String(msg.text) }]
        });
    }

    contents.push({
        role: 'user',
        parts: [{ text: `${username}:${userPrompt}` }]
    });

    const payload = {
        contents: contents,
        systemInstruction: {
            parts: [{ text: systemInstruction }]
        },
        generationConfig: {
            temperature: 0.85,
            maxOutputTokens: 800
        }
    };

    const targetModel = await getAvailableModel(apiKey);

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (res.ok && data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
            return data.candidates[0].content.parts[0].text.trim();
        }

        if (data.error) {
            cachedWorkingModel = null; // Cache invalidate agar fail ho
            return `❌ AI Error: \`${data.error.message}\``;
        }
    } catch (err) {
        cachedWorkingModel = null;
        return `❌ AI Error: \`${err.message}\``;
    }

    return '❌ AI Error: Failed to generate response from model.';
}

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        if (!message.guild || message.author.bot) return;

        const content = message.content.trim();
        const isBotOwner = BOT_OWNERS.includes(message.author.id);
        const isServerOwner = message.author.id === message.guild.ownerId;
        const isAdmin = message.member?.permissions.has('Administrator');

        // %ai Commands
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

                return message.reply(`🤖 **SparkCore AI Activated!**\nBound channel: ${targetChannel}. AI ab is channel me active hai!`);
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
            if (!reply.startsWith('❌')) {
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

    console.log('✔ SparkCore Direct REST AI Engine active.');
};
