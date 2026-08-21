const { ChannelType } = require('discord.js');

// Webhook Fetch or Create Helper
async function getOrCreateWebhook(channel) {
    if (!channel.guild || channel.type !== ChannelType.GuildText) return null;

    const webhooks = await channel.fetchWebhooks().catch(() => null);
    if (!webhooks) return null;

    let webhook = webhooks.find(wh => wh.owner && wh.owner.id === channel.client.user.id);
    if (!webhook) {
        webhook = await channel.createWebhook({
            name: 'Emoji-Proxy',
            avatar: channel.client.user.displayAvatarURL(),
            reason: 'Non-Nitro Custom Emoji Webhook Proxy'
        }).catch(() => null);
    }
    return webhook;
}

module.exports = (client) => {
    // Bot Ready hone par Application Emojis cache fetch karna
    client.once('ready', async () => {
        try {
            await client.application.emojis.fetch();
            console.log(`✔ Loaded ${client.application.emojis.cache.size} Developer Portal Application Emojis.`);
        } catch (err) {
            console.error('Error fetching application emojis:', err);
        }
    });

    client.on('messageCreate', async (message) => {
        // Bots aur DMs ignore
        if (message.author.bot || !message.guild) return;

        const content = message.content;
        if (!content) return;

        // Emoji Pattern detect karna: :emoji_name:
        const emojiRegex = /(?<!<a?:)(?<!<):([a-zA-Z0-9_~]+):/g;
        const matches = [...content.matchAll(emojiRegex)];

        if (!matches || matches.length === 0) return;

        let hasReplacements = false;
        let newContent = content;

        for (const match of matches) {
            const rawMatch = match[0]; // e.g. :STEVE_GAMER:
            const emojiName = match[1].toLowerCase();

            // 1. Check Developer Portal Application Emojis (Highest Priority)
            let targetEmoji = client.application.emojis.cache.find(
                e => e.name.toLowerCase() === emojiName
            );

            // 2. Check Current Server Emojis
            if (!targetEmoji) {
                targetEmoji = message.guild.emojis.cache.find(
                    e => e.name.toLowerCase() === emojiName
                );
            }

            // 3. Check All Servers Bot is in
            if (!targetEmoji) {
                targetEmoji = client.emojis.cache.find(
                    e => e.name.toLowerCase() === emojiName
                );
            }

            // Replace with full discord emoji syntax
            if (targetEmoji) {
                const formattedEmoji = targetEmoji.animated 
                    ? `<a:${targetEmoji.name}:${targetEmoji.id}>` 
                    : `<:${targetEmoji.name}:${targetEmoji.id}>`;

                newContent = newContent.replace(rawMatch, formattedEmoji);
                hasReplacements = true;
            }
        }

        // Agar koi custom emoji mila toh webhook proxy se bhej do
        if (hasReplacements) {
            try {
                const webhook = await getOrCreateWebhook(message.channel);
                if (!webhook) return;

                await message.delete().catch(() => {});

                await webhook.send({
                    content: newContent,
                    username: message.member ? message.member.displayName : message.author.username,
                    avatarURL: message.author.displayAvatarURL({ dynamic: true }),
                    files: message.attachments.map(a => a.url)
                });
            } catch (err) {
                console.error('Nitro emoji webhook proxy error:', err);
            }
        }
    });

    console.log('✔ Non-Nitro & Application Emoji Webhook handler loaded.');
};
            
