const AIConfig = require('../models/aiConfig');
const { isFeatureEnabled } = require('../utils/featureCheck');

const BOT_OWNERS = [
    '1549995551288852584',
    '1266728371719508062', // FZBOY
    '1474216218792558735'  // DAREQUEEN
];

const conversationMemory = new Map();

// Helper: Sleep utility for micro-retry
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Fast Failover Backup Generator (Zero rate limits, unlimited fallback)
async function fetchBackupAIResponse(systemInstruction, history, userPrompt, username) {
    try {
        const fullPrompt = `System Rules: ${systemInstruction}\n\nRecent Chat:\n${history.map(h => `${h.role}:${h.text}`).join('\n')}\n\n${username}: ${userPrompt}`;
        const url = `https://text.pollinations.ai/${encodeURIComponent(fullPrompt)}`;
        
        const res = await fetch(url);
        if (!res.ok) return null;
        const text = await res.text();
        return text.trim();
    } catch (_) {
        return null;
    }
}

async function getSparkCoreAIResponse(history, userPrompt, username, userId, guildName) {
    const apiKey = process.env.GEMINI_API_KEY;
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

    // 1. Primary Engine: Google Gemini API with Fallback Models
    if (apiKey) {
        const contents = [];
        for (const msg of history) {
            contents.push({
                role: msg.role === 'model' ? 'model' : 'user',
                parts: [{ text: String(msg.text) }]
            });
        }

        contents.push({
            role: 'user',
            parts: [{ text: `${username}: ${userPrompt}` }]
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

        const models = ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'];

        for (const model of models) {
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await res.json();

                if (res.ok && data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
                    return data.candidates[0].content.parts[0].text.trim();
                }

                // If busy/overloaded, wait 400ms and try next model
                await sleep(400);
            } catch (_) {
                await sleep(400);
            }
        }
    }

    // 2. Secondary Engine: Instant Failover (Jab Google ke saare endpoints busy hon)
    const backupReply = await fetchBackupAIResponse(systemInstruction, history, userPrompt, username);
    if (backupReply) {
        return backupReply;
    }

    // 3. Fallback Reply in Character (Kahin se bhi generic error message nahi aayega)
    return `Arre ${username}, thoda net lag ho gaya tha! Ek baar wapas se bolo, sun raha hoon! ⚡`;
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
            history.push({ role: 'user', text: `${message.author.username}: ${message.content}` });
            history.push({ role: 'model', text: reply });

            if (history.length > 8) {
                history = history.slice(history.length - 8);
            }
            conversationMemory.set(memKey, history);

            const chunks = reply.match(/[\s\S]{1,1990}/g) || [reply];
            for (const chunk of chunks) {
                await message.reply({ content: chunk }).catch(() => {});
            }
        }
    });

    console.log('✔ SparkCore High-Availability AI Engine loaded.');
};
