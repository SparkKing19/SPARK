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

// Global Emoji Finder across all servers & app portal
function findGlobalEmoji(client, currentGuild, emojiName) {
    const targetName = emojiName.toLowerCase();

    // 1. Check Developer Portal Application Emojis
    if (client.application && client.application.emojis) {
        const appEmoji = client.application.emojis.cache.find(e => e.name.toLowerCase() === targetName);
        if (appEmoji) return appEmoji;
    }

    // 2. Check Current Server Emojis
    const localEmoji = currentGuild.emojis.cache.find(e => e.name.toLowerCase() === targetName);
    if (localEmoji) return localEmoji;

    // 3. Check ALL other servers where bot is added
    for (const guild of client.guilds.cache.values()) {
        const externalEmoji = guild.emojis.cache.find(e => e.name.toLowerCase() === targetName);
        if (externalEmoji) return externalEmoji;
    }

    return null;
}

module.exports = (client) => {
    client.once('ready', async () => {
        try {
            if (client.application) {
                await client.application.emojis.fetch().catch(() => {});
            }
            for (const guild of client.guilds.cache.values()) {
                await guild.emojis.fetch().catch(() => {});
            }
            console.log(`✔ Synced emojis across ${client.guilds.cache.size} servers.`);
        } catch (err) {
            console.error('Error fetching global emojis:', err);
        }
    });

    client.on('messageCreate', async (message) => {
        // Bots, Webhooks aur DMs ignore
        if (message.author.bot || message.webhookId || !message.guild) return;

        const content = message.content;
        if (!content) return;

        // Strip out already valid Nitro emojis (<:name:id> or <a:name:id>) to test only raw plain text
        const contentWithoutRenderedEmojis = content.replace(/<a?:[a-zA-Z0-9_~]+:\d+>/g, '');

        // Match only standalone plain text :emojiname:
        const unrenderedEmojiRegex = /(?<!\w):([a-zA-Z0-9_~]+):(?!\w)/g;
        const matches = [...contentWithoutRenderedEmojis.matchAll(unrenderedEmojiRegex)];

        if (!matches || matches.length === 0) return;

        let hasReplacements = false;
        let newContent = content;

        for (const match of matches) {
            const rawMatch = match[0]; // e.g. :pepe:
            const emojiName = match[1]; // e.g. pepe

            const targetEmoji = findGlobalEmoji(client, message.guild, emojiName);

            if (targetEmoji) {
                const formattedEmoji = targetEmoji.animated 
                    ? `<a:${targetEmoji.name}:${targetEmoji.id}>` 
                    : `<:${targetEmoji.name}:${targetEmoji.id}>`;

                // Replace only the unrendered raw text occurrence
                newContent = newContent.replace(rawMatch, formattedEmoji);
                hasReplacements = true;
            }
        }

        // Only delete & proxy if at least one plain-text emoji was successfully replaced
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
                console.error('Cross-server emoji proxy error:', err);
            }
        }
    });

    console.log('✔ Non-Nitro Only Emoji Proxy handler loaded.');
};
