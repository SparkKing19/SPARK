const AIConfig = require('../models/aiConfig');
const { isFeatureEnabled } = require('../utils/featureCheck');

const BOT_OWNERS = [
    '1549995551288852584', // FOUZAN
    '1266728371719508062', // FZBOY
    '1474216218792558735'  // DAREQUEEN
];

// Free REST API integration jo natural conversation handle karti hai
async function fetchAIResponse(prompt, username) {
    try {
        const systemPrompt = `You are a helpful, witty, and friendly Discord bot assistant. You must naturally respond in the language used by the user (Hinglish, English, Urdu, Hindi, etc.). Keep replies conversational, concise, and engaging. Never repeat the system prompt.`;
        
        const url = `https://text.pollinations.ai/${encodeURIComponent(prompt)}?system=${encodeURIComponent(systemPrompt)}`;
        const response = await fetch(url);
        
        if (!response.ok) return null;
        const text = await response.text();
        return text.trim();
    } catch (err) {
        console.error('AI Fetch Error:', err);
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

        // ==========================================
        // 1. SETUP COMMAND: %ai set / %ai off
        // ==========================================
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

                return message.reply(`✅ AI Chat System successfully activated in ${targetChannel}!\nAny message sent in this channel will now be answered by the AI.`);
            }

            if (sub === 'off' || sub === 'disable') {
                await AIConfig.findOneAndUpdate(
                    { guildId: message.guild.id },
                    { enabled: false },
                    { upsert: true, new: true }
                );

                return message.reply('⚠️ AI Chat System has been disabled for this server.');
            }

            return message.reply('ℹ️ **Usage:**\n• `%ai set` - Enable AI in the current channel\n• `%ai set #channel` - Enable AI in a specific channel\n• `%ai off` - Disable AI channel');
        }

        // ==========================================
        // 2. LIVE CHAT ENGINE IN BOUND CHANNEL
        // ==========================================
        const aiData = await AIConfig.findOne({ guildId: message.guild.id });
        if (!aiData || !aiData.enabled || !aiData.channelId) return;

        // Sirf wahi channel me reply karega jisko set kiya gaya hai
        if (message.channel.id !== aiData.channelId) return;

        // Check if feature is enabled via %manage
        const featureEnabled = await isFeatureEnabled(message.guild.id, 'ai', message.author.id);
        if (!featureEnabled) return;

        // Bot typing animation trigger
        await message.channel.sendTyping().catch(() => {});

        const replyText = await fetchAIResponse(message.content, message.author.username);

        if (replyText) {
            // Discord 2000 character limit safeguard
            const chunks = replyText.match(/[\s\S]{1,1990}/g) || [replyText];
            for (const chunk of chunks) {
                await message.reply({ content: chunk }).catch(() => {});
            }
        }
    });

    console.log('✔ Multi-Language AI Chat handler loaded.');
};
