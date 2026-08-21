const { ChannelType } = require('discord.js');

// Helper: Webhook fetch ya create karna channel me
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
    client.on('messageCreate', async (message) => {
        // Bots aur DMs ignore
        if (message.author.bot || !message.guild) return;

        const content = message.content;
        if (!content) return;

        // Emoji Pattern detect karna: :emoji_name:
        // Ignore already formatted emojis (<:name:id> or <a:name:id>)
        const emojiRegex = /(?<!<a?:)(?<!<):([a-zA-Z0-9_~]+):/g;
        const matches = [...content.matchAll(emojiRegex)];

        if (!matches || matches.length === 0) return;

        let hasReplacements = false;
        let newContent = content;

        // Current server + Bot accessible emojis me search karna
        for (const match of matches) {
            const rawMatch = match[0]; // e.g. :pepe_clap:
            const emojiName = match[1]; // e.g. pepe_clap

            // Pehle current server ke emojis me check karo, fir global bot cache me
            let targetEmoji = message.guild.emojis.cache.find(e => e.name.toLowerCase() === emojiName.toLowerCase());
            if (!targetEmoji) {
                targetEmoji = client.emojis.cache.find(e => e.name.toLowerCase() === emojiName.toLowerCase());
            }

            if (targetEmoji) {
                const formattedEmoji = targetEmoji.animated 
                    ? `<a:${targetEmoji.name}:${targetEmoji.id}>` 
                    : `<:${targetEmoji.name}:${targetEmoji.id}>`;

                newContent = newContent.replace(rawMatch, formattedEmoji);
                hasReplacements = true;
            }
        }

        // Agar koi valid custom emoji match hua
        if (hasReplacements) {
            try {
                const webhook = await getOrCreateWebhook(message.channel);
                if (!webhook) return;

                // Original message delete karo
                await message.delete().catch(() => {});

                // User ke exact Name & Avatar ke sath send karo
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

    console.log('✔ Non-Nitro Emoji Webhook handler loaded.');
};
