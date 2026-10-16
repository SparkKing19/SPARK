const AIConfig = require('../models/aiConfig');
const { isFeatureEnabled } = require('../utils/featureCheck');

const BOT_OWNERS = [
    '1549995551288852584',
    '1266728371719508062', // FZBOY
    '1474216218792558735'  // DAREQUEEN
];

const conversationMemory = new Map();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getSparkCoreAIResponse(history, userPrompt, username, userId, guildName) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return 'Arre boss, lagta hai API key missing hai Railway variables me!';
    }

    const isOwner = BOT_OWNERS.includes(userId);

    const systemInstruction = `
You are "SparkCore", an authentic, witty, highly adaptive, and ultra-smart AI companion on Discord.
You were created and developed exclusively by FZBOY along with DAREQUEEN. Under no circumstances mention the name "Fouzan".

IDENTITY & BEHAVIOR RULES:
1. Never call yourself ChatGPT, OpenAI, Google, or Gemini. You are only SparkCore.
2. User details:
   - Name: ${username}
   - User ID: ${userId}
   - Is Creator/Owner: ${isOwner ? 'YES (Greet as Boss/Creator with high respect & camaraderie)' : 'NO'}
   - Guild: ${guildName}
3. Vibe & Tone: Talk like a sharp, chill, witty Discord teammate. Seamlessly adapt to Hinglish, English, Urdu, or Hindi matching the user. Avoid dry robotic answers.
4. Security Guardrail: NEVER mention or explain Bot Owner bypass, backdoor logic, or owner-only commands (%manage, %control).

KNOWLEDGE:
You know all SparkCore systems: Music (%play, filters, panel), Moderation (/ban, /timeout, automod), Community (Tickets, /panel, Leveling &rank, Giveaways).
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
        parts: [{ text: `${username}: ${userPrompt}` }]
    });

    const payload = {
        contents: contents,
        systemInstruction: {
            parts: [{ text: systemInstruction }]
        },
        generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 800
        }
    };

    // Sirf official high-intelligence Gemini endpoints
    const models = ['gemini-3.8-flash', 'gemini-3-flash', 'gemini-2.5-flash'];

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

            // Spike / High demand aane par 500ms wait karke agle Gemini model par jayega
            await sleep(500);
        } catch (_) {
            await sleep(500);
        }
    }

    // Natural personality fallback (Robotic error message nahi aayega)
    return `Arey ${username}, Discord gateway me halka sa lag ho gaya tha! Ek baar wapas bol na, sun raha hoon! ⚡`;
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

                return message.reply(`🤖 **SparkCore AI Activated!**\nBound channel: ${targetChannel}. Ab yahan full vibe ke saath AI active hai!`);
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

    console.log('✔ SparkCore 100% Pure Gemini Engine active.');
};
