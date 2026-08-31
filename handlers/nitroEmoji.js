const { ChannelType } = require('discord.js');

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

function findGlobalEmoji(client, currentGuild, emojiName) {
    const targetName = emojiName.toLowerCase();

    // 1. Application Emojis
    if (client.application && client.application.emojis) {
        const appEmoji = client.application.emojis.cache.find(e => e.name.toLowerCase() === targetName);
        if (appEmoji) return appEmoji;
    }

    // 2. Local Server Emojis
    const localEmoji = currentGuild.emojis.cache.find(e => e.name.toLowerCase() === targetName);
    if (localEmoji) return localEmoji;

    // 3. Global Guild Emojis
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
        if (message.author.bot || message.webhookId || !message.guild) return;

        const content = message.content;
        if (!content) return;

        let hasReplacements = false;

        // Matches :emojiname: only when NOT part of an existing <a:name:id> or <:name:id>
        const emojiRegex = /(?<!<a?:)(?<!\w):([a-zA-Z0-9_~]+):(?!\d+>)(?!\w)/g;

        const newContent = content.replace(emojiRegex, (match, emojiName) => {
            const targetEmoji = findGlobalEmoji(client, message.guild, emojiName);
            if (targetEmoji) {
                hasReplacements = true;
                return targetEmoji.animated 
                    ? `<a:${targetEmoji.name}:${targetEmoji.id}>` 
                    : `<:${targetEmoji.name}:${targetEmoji.id}>`;
            }
            return match; // Leave untouched if emoji doesn't exist
        });

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
