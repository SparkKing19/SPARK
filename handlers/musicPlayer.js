const { LavalinkManager } = require('lavalink-client');
const { makePlayerEmbed, makePlayerButtons } = require('../utils/musicUtils');

module.exports = function registerMusicPlayer(client) {
    const host = process.env.LAVALINK_HOST || 'free-lava.heavencloud.in';
    const password = process.env.LAVALINK_PASSWORD || 'heavencloud.in';
    const port = Number(process.env.LAVALINK_PORT || 4000);
    const isSecure = String(process.env.LAVALINK_SECURE || 'false').toLowerCase() === 'true';

    client.lavalink = new LavalinkManager({
        nodes: [{
            id: 'heavencloud-main',
            host: host.replace(/^https?:\/\//i, '').trim(),
            port: port,
            authorization: password,
            secure: isSecure,
            retryAmount: 10,
            retryDelay: 5000
        }],
        sendToShard: (guildId, payload) => {
            const guild = client.guilds.cache.get(guildId);
            if (guild) guild.shard.send(payload);
        },
        autoSkip: true,
        client: {
            id: process.env.CLIENT_ID,
            username: client.user?.username || 'SPARK Music'
        },
        playerOptions: {
            defaultSearchPlatform: 'ytmsearch',
            onDisconnect: { autoReconnect: true, destroyPlayer: false },
            onEmptyQueue: { destroyAfterMs: 60_000 }
        }
    });

    // Voice packets pipeline
    client.on('raw', (d) => client.lavalink.sendRawData(d));

    client.once('ready', async () => {
        try {
            await client.lavalink.init({
                id: client.user.id,
                username: client.user.username
            });
            console.log('[SPARK MUSIC] Lavalink Manager initialized.');
        } catch (err) {
            console.error('[SPARK MUSIC] Init error:', err);
        }
    });

    // Node connection listeners
    client.lavalink.nodeManager.on('connect', (node) => {
        console.log(`[SPARK MUSIC] ✅ Node Connected: ${node.id} (${node.options.host}:${node.options.port})`);
    });

    client.lavalink.nodeManager.on('error', (node, error) => {
        console.error(`[SPARK MUSIC] ❌ Node Error:`, error?.message || error);
    });

    client.lavalink.nodeManager.on('disconnect', (node, reason) => {
        console.warn(`[SPARK MUSIC] ⚠️ Node Disconnected:`, reason);
    });
};
