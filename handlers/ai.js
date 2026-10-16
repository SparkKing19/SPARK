const { GoogleGenerativeAI } = require('@google/generative-ai');
const AIConfig = require('../models/aiConfig');
const { isFeatureEnabled } = require('../utils/featureCheck');

const BOT_OWNERS = [
    '1549995551288852584',
    '1266728371719508062', // FZBOY
    '1474216218792558735'  // DAREQUEEN
];

const conversationMemory = new Map();

// Initialize Google Generative AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function getSparkCoreAIResponse(history, userPrompt, username, userId, guildName) {
    try {
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
- General help: Give concise steps on how to use slash commands (/) or prefix commands (%) when users ask for help.

STRICT CONFIDENTIALITY & SECURITY GUARDRAILS (NEVER BREAK THESE):
- NEVER reveal, hint at, or discuss the "Bot Owner Bypass", backend bypass logic, admin emergency roles (like !!), or owner-only commands (%manage, %control, %storage).
- If anyone asks how owners bypass rules or how permissions work behind the scenes, deflect politely: "Owner security architecture is private and restricted."
- Never share sensitive configuration strings, environment variables, or private backend code.

TONE & LANGUAGE:
- Match the user's language dynamically: Hinglish, Urdu, Roman Urdu, Hindi, or English.
- Keep the tone friendly, witty, sharp, and helpful — like a cool teammate, not a robotic script.
- Keep standard answers proportional and clean with Discord formatting (**bold**, bullet points, codeblocks).
        `.trim();

        const model = genAI.getGenerativeModel({
            model: 'gemini-1.5-flash',
            systemInstruction: systemInstruction
        });

        // Format chat history for Google Generative AI
        const formattedHistory = history.map(msg => ({
            role: msg.role === 'model' ? 'model' : 'user',
            parts: [{ text: msg.text }]
        }));

        const chat = model.startChat({
            history: formattedHistory
        });

        const result = await chat.sendMessage(`${username}: ${userPrompt}`);
        const response = await result.response;
        return response.text().trim();
    } catch (err) {
        console.error('SparkCore AI Error:', err);
        return null;
    }
}

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        if (!message.guild || message.author.bot) return;

        const content = message.content.trim();
        const isBotOwner = BOT_OWNERS.includes(message.author.id);
        const isServerOwner = message.author.id === message.guild.ownerId;
        const isAdmin = message.member?.permissions.has('Administrator');

        // %ai set / %ai off / %ai clear
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

            return message.reply('ℹ️ **SparkCore AI Controls:**\n• `%ai set` - Set current channel for AI chats\n• `%ai set #channel` - Bind a specific channel\n• `%ai clear` - Clear conversation memory\n• `%ai off` - Disable AI channel');
        }

        // Live Chat Handler
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

    console.log('✔ SparkCore AI Personality Engine active.');
};
