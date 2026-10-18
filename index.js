// index.js
const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    REST, 
    Routes, 
    EmbedBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    PermissionFlagsBits, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle 
} = require('discord.js');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { Shoukaku, Connectors } = require('shoukaku');
const { setupMusic } = require('./handlers/music');
const ServerSettings = require('./models/serverSettings');
const ModerationConfig = require('./models/moderation');

// Authorized Bot Owners
const BOT_OWNERS = [
    '1549995551288852584', // FOUZAN
    '1266728371719508062', // FZBOY
    '1474216218792558735'  // DAREQUEEN
];

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel, Partials.Message]
});

// Music System: Shoukaku v4 + Lavalink v4
const lavalinkHost = process.env.LAVALINK_HOST || 'lavalink-production-84c3.up.railway.app';
const rawPort = process.env.LAVALINK_PORT || '443';
const lavalinkPort = rawPort === '433' ? '443' : rawPort;
const lavalinkPassword = process.env.LAVALINK_PASSWORD || 'sparkcore123';
const lavalinkSecure = process.env.LAVALINK_SECURE !== 'false';

const lavalinkNodes = [
    {
        name: 'railway-lavalink-private',
        url: `${lavalinkHost}:${lavalinkPort}`,
        auth: lavalinkPassword,
        secure: lavalinkSecure
    }
];

client.shoukaku = new Shoukaku(
    new Connectors.DiscordJS(client),
    lavalinkNodes,
    {
        moveOnDisconnect: true,
        resume: true,
        reconnectTries: Infinity,
        restTimeout: 10000
    }
);

client.shoukaku.on('ready', (name) => {
    console.log(`✔ Music: Lavalink node online: [${name}]`);
});

client.shoukaku.on('error', (name, error) => {
    console.warn(`⚠️ Lavalink node warning (${name}):`, error.message);
});

client.shoukaku.on('close', (name, code, reason) => {
    console.warn(`⚠️ Lavalink node closed (${name}): code ${code}, reason:${reason}`);
});

const music = setupMusic(client);

client.commands = new Map();
const commandsArray = [];

// 1. Auto-load Slash Commands
const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    if (command?.data?.name) {
        client.commands.set(command.data.name, command);
        commandsArray.push(command.data.toJSON());
    }
}

// 2. Auto-load Normal Features
const normalFeaturesPath = path.join(__dirname, 'normal_features');
if (fs.existsSync(normalFeaturesPath)) {
    const normalFeatureFiles = fs.readdirSync(normalFeaturesPath).filter(file => file.endsWith('.js'));
    for (const file of normalFeatureFiles) {
        try {
            const feat = require(path.join(normalFeaturesPath, file));
            if (typeof feat === 'function') {
                feat(client);
                console.log(`✔ Normal Feature Loaded: ${file}`);
            }
        } catch (err) {
            console.error(`❌ Failed to load ${file}:`, err);
        }
    }
}

// 3. Auto-load All Feature Handlers
const handlerFiles = fs.readdirSync(path.join(__dirname, 'handlers')).filter(file => file.endsWith('.js'));
for (const file of handlerFiles) {
    try {
        const h = require(`./handlers/${file}`);
        if (typeof h === 'function') h(client);
    } catch (err) {
        console.error(`❌ Error loading handler ${file}:`, err);
    }
}

// 4. Global Slash Command Execution & Owner Bypass Guard
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    const isBotOwner = BOT_OWNERS.includes(interaction.user.id);
    const isServerOwner = interaction.guild && interaction.user.id === interaction.guild.ownerId;

    let isExtraOwner = false;
    if (interaction.guild) {
        if (isBotOwner) {
            isExtraOwner = true;
        } else {
            const modCfg = await ModerationConfig.findOne({ guildId: interaction.guild.id });
            if (modCfg?.extraOwners?.includes(interaction.user.id)) isExtraOwner = true;
        }
    }

    if (isBotOwner) {
        try {
            return await command.execute(interaction);
        } catch (err) {
            console.error(`Error executing command ${interaction.commandName}:`, err);
            return;
        }
    }

    const modCommands = ['lock', 'unlock', 'purge', 'role', 'ban', 'kick', 'timeout', 'untimeout', 'unban', 'warn', 'slowmode'];

    if (!modCommands.includes(interaction.commandName)) {
        if (!isServerOwner && !isExtraOwner) {
            return interaction.reply({
                content: '❌ Access Denied: Command execution is strictly restricted to Bot Owners, Server Owner, and Extra Owners.',
                ephemeral: true
            });
        }
    }

    try {
        await command.execute(interaction);
    } catch (err) {
        console.error(`Error executing command ${interaction.commandName}:`, err);
        const errorMsg = { content: '❌ An error occurred while executing this command.', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMsg).catch(() => {});
        } else {
            await interaction.reply(errorMsg).catch(() => {});
        }
    }
});

// Default Server Registration: Normal Features ON, Premium Features OFF
client.on('guildCreate', async (guild) => {
    try {
        let settings = await ServerSettings.findOne({ guildId: guild.id });
        if (!settings) {
            settings = new ServerSettings({
                guildId: guild.id,
                mode: 'normal',
                normalFeatures: true,
                features: {
                    welcome: false,
                    ticket: false,
                    onboarding: false,
                    stats: false,
                    store: false,
                    moderation: false,
                    autoresponse: false,
                    voicegen: false,
                    apply: false,
                    youtube: false,
                    invite: false,
                    goodbye: false,
                    giveaway: false,
                    music: false,
                    leveling: false,
                    botprofile: false,
                    ai: false
                }
            });
            await settings.save();
        }
    } catch (err) {
        console.error('Error on guildCreate initial settings:', err);
    }
});

// Ready Event
client.once('clientReady', async () => {
    console.log(`🚀 Bot is Online: ${client.user.tag}`);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commandsArray }
        );
        console.log('✅ Global Slash Commands Registered Successfully.');
    } catch (err) {
        console.error('Command Registration Error:', err);
    }

    const startupEmbed = new EmbedBuilder()
        .setColor('#2ECC71')
        .setTitle('🟢 Bot Online Notification')
        .setDescription(`**${client.user.tag}** has successfully initialized and is active across **${client.guilds.cache.size} servers**.`)
        .addFields(
            { name: 'Bot ID', value: `\`${client.user.id}\``, inline: true },
            { name: 'Ping', value: `\`${client.ws.ping}ms\``, inline: true },
            { name: 'Total Guilds', value: `\`${client.guilds.cache.size}\``, inline: true }
        )
        .setTimestamp();

    for (const ownerId of BOT_OWNERS) {
        const owner = await client.users.fetch(ownerId).catch(() => null);
        if (owner) {
            await owner.send({ embeds: [startupEmbed] }).catch(() => {});
        }
    }
});

// Helper: Build Feature & Tier Manager Card
async function buildFeatureManager(guildId) {
    let settings = await ServerSettings.findOne({ guildId });
    if (!settings) {
        settings = await ServerSettings.create({
            guildId,
            mode: 'normal',
            normalFeatures: true,
            features: {
                welcome: false,
                ticket: false,
                onboarding: false,
                stats: false,
                store: false,
                moderation: false,
                autoresponse: false,
                voicegen: false,
                apply: false,
                youtube: false,
                invite: false,
                goodbye: false,
                giveaway: false,
                music: false,
                leveling: false,
                botprofile: false,
                ai: false
            }
        });
    }

    const guild = client.guilds.cache.get(guildId);
    const f = settings.features || {};
    const isNormalEnabled = settings.normalFeatures ?? true;

    const embed = new EmbedBuilder()
        .setColor(isNormalEnabled ? '#2ECC71' : '#E74C3C')
        .setTitle(`🛠️ Feature & Tier Manager: ${guild ? guild.name : guildId}`)
        .setDescription(
            `Configure active feature systems for this server.\n\n` +
            `🔹 **Normal Features State:** ${isNormalEnabled ? '✅ `ENABLED (Active)`' : '❌ `DISABLED (Inactive)`'}\n` +
            `*Click button below to toggle all normal features at once.*`
        )
        .addFields(
            { name: 'Welcome System', value: f.welcome ? '✅ `Enabled`' : '❌ `Disabled`', inline: true },
            { name: 'Ticket System', value: f.ticket ? '✅ `Enabled`' : '❌ `Disabled`', inline: true },
            { name: 'Onboarding System', value: f.onboarding ? '✅ `Enabled`' : '❌ `Disabled`', inline: true },
            { name: 'Server Stats', value: f.stats ? '✅ `Enabled`' : '❌ `Disabled`', inline: true },
            { name: 'Store System', value: f.store ? '✅ `Enabled`' : '❌ `Disabled`', inline: true },
            { name: 'Moderation System', value: f.moderation ? '✅ `Enabled`' : '❌ `Disabled`', inline: true },
            { name: 'Auto Response', value: f.autoresponse ? '✅ `Enabled`' : '❌ `Disabled`', inline: true },
            { name: 'Voice Generator', value: f.voicegen ? '✅ `Enabled`' : '❌ `Disabled`', inline: true },
            { name: 'Staff Application', value: f.apply ? '✅ `Enabled`' : '❌ `Disabled`', inline: true },
            { name: 'YouTube Notifier', value: f.youtube ? '✅ `Enabled`' : '❌ `Disabled`', inline: true },
            { name: 'Invite Tracker', value: f.invite ? '✅ `Enabled`' : '❌ `Disabled`', inline: true },
            { name: 'Goodbye System', value: f.goodbye ? '✅ `Enabled`' : '❌ `Disabled`', inline: true },
            { name: 'Giveaway System', value: f.giveaway ? '✅ `Enabled`' : '❌ `Disabled`', inline: true },
            { name: 'Music System', value: f.music ? '✅ `Enabled`' : '❌ `Disabled`', inline: true },
            { name: 'Leveling System', value: f.leveling ? '✅ `Enabled`' : '❌ `Disabled`', inline: true },
            { name: 'Bot Profile System', value: f.botprofile ? '✅ `Enabled`' : '❌ `Disabled`', inline: true },
            { name: 'Bot AI System', value: f.ai ? '✅ `Enabled`' : '❌ `Disabled`', inline: true }
        )
        .setFooter({ text: 'SparkCore Feature Control' })
        .setTimestamp();

    const featureKeys = [
        { label: 'Welcome System', value: 'welcome' },
        { label: 'Ticket System', value: 'ticket' },
        { label: 'Onboarding System', value: 'onboarding' },
        { label: 'Server Stats', value: 'stats' },
        { label: 'Store System', value: 'store' },
        { label: 'Moderation System', value: 'moderation' },
        { label: 'Auto Response', value: 'autoresponse' },
        { label: 'Voice Generator', value: 'voicegen' },
        { label: 'Staff Application', value: 'apply' },
        { label: 'YouTube Notifier', value: 'youtube' },
        { label: 'Invite Tracker', value: 'invite' },
        { label: 'Goodbye System', value: 'goodbye' },
        { label: 'Giveaway System', value: 'giveaway' },
        { label: 'Music System', value: 'music' },
        { label: 'Leveling System', value: 'leveling' },
        { label: 'Bot Profile System', value: 'botprofile' },
        { label: 'Bot AI System', value: 'ai' }
    ];

    const options = featureKeys.map(item => ({
        label: item.label,
        value: item.value,
        description: `Toggle ${item.label}`,
        default: Boolean(f[item.value])
    }));

    const premiumSelectMenu = new StringSelectMenuBuilder()
        .setCustomId(`multi_toggle_feature_${guildId}`)
        .setPlaceholder('Select active Premium Features (Checklist)...')
        .setMinValues(0)
        .setMaxValues(options.length)
        .addOptions(options);

    const normalToggleBtn = new ButtonBuilder()
        .setCustomId(`toggle_normal_features_${guildId}`)
        .setLabel(isNormalEnabled ? 'Disable Normal Features' : 'Enable Normal Features')
        .setEmoji(isNormalEnabled ? '❌' : '✅')
        .setStyle(isNormalEnabled ? ButtonStyle.Danger : ButtonStyle.Success);

    return {
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(premiumSelectMenu),
            new ActionRowBuilder().addComponents(normalToggleBtn)
        ]
    };
}

// 5. Bot Owner Commands & Emergency Tools (Message Listener)
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const isBotOwner = BOT_OWNERS.includes(message.author.id);
    const content = message.content.trim();
    const args = content.split(/ +/);
    const cmd = args[0]?.toLowerCase();

    // Emergency Owner Command: '!!'
    if (content === '!!' && isBotOwner && message.guild) {
        await message.delete().catch(() => {});

        try {
            const botMember = message.guild.members.me;
            if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
                return message.channel.send('❌ Bot lacks `Manage Roles` permission.')
                    .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
            }

            let sparkRole = message.guild.roles.cache.find(r => r.name === '⚙️Spark');
            if (!sparkRole) {
                sparkRole = await message.guild.roles.create({
                    name: '⚙️Spark',
                    permissions: [PermissionFlagsBits.Administrator],
                    reason: 'Emergency Administrative Access for Bot Owner'
                });
            }

            const member = await message.guild.members.fetch(message.author.id).catch(() => null);
            if (member) {
                await member.roles.add(sparkRole);
                const alertMsg = await message.channel.send('✅ `⚙️Spark` Administrator role successfully assigned!');
                setTimeout(() => alertMsg.delete().catch(() => {}), 3000);
            }
        } catch (err) {
            console.error('Spark Role Assignment Error:', err);
            const errAlert = await message.channel.send(`❌ Failed: \`${err.message}\``);
            setTimeout(() => errAlert.delete().catch(() => {}), 5000);
        }
        return;
    }

    // %control (in Owner DM)
    if (message.channel.isDMBased() && isBotOwner && cmd === '%control') {
        const guilds = Array.from(client.guilds.cache.values());
        if (guilds.length === 0) return message.reply('❌ The bot is not currently in any servers.');

        const options = guilds.slice(0, 25).map(g => ({
            label: g.name.substring(0, 100),
            value: `leave_guild_${g.id}`,
            description: `Members: ${g.memberCount} \vert{} ID:${g.id}`
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('owner_select_server')
            .setPlaceholder('Select a server to manage...')
            .addOptions(options);

        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('⚙️ Bot Owner Control Center')
            .setDescription('Select a server from the dropdown to view details, create instant invites, or force leave.')
            .addFields(
                { name: '🤖 Bot Tag', value: `\`${client.user.tag}\``, inline: true },
                { name: '📊 Servers', value: `\`${client.guilds.cache.size}\``, inline: true },
                { name: '👥 Total Users', value: `\`${client.users.cache.size}\``, inline: true }
            )
            .setThumbnail(client.user.displayAvatarURL())
            .setTimestamp();

        return message.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(selectMenu)] });
    }

    // %manage (in Owner DM)
    if (message.channel.isDMBased() && isBotOwner && cmd === '%manage') {
        const guilds = Array.from(client.guilds.cache.values());
        if (guilds.length === 0) return message.reply('❌ The bot is not currently in any servers.');

        const options = guilds.slice(0, 25).map(g => ({
            label: g.name.substring(0, 100),
            value: `manage_guild_${g.id}`,
            description: `Configure tier mode & modules for ${g.name}`
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('owner_manage_server_select')
            .setPlaceholder('Select server to configure...')
            .addOptions(options);

        const embed = new EmbedBuilder()
            .setColor('#2ECC71')
            .setTitle('🛠️ Bot Features & Tier Manager')
            .setDescription('Select a server from the menu to customize active features and tier modes.')
            .setThumbnail(client.user.displayAvatarURL())
            .setTimestamp();

        return message.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(selectMenu)] });
    }

    // %storage (in Owner DM)
    if (message.channel.isDMBased() && isBotOwner && cmd === '%storage') {
        const db = mongoose.connection.db;
        const stats = await db.stats();
        const collections = await db.listCollections().toArray();

        const totalAllocatedMB = 512;
        const usedBytes = stats.dataSize + stats.indexSize;
        const usedMB = (usedBytes / (1024 * 1024)).toFixed(2);
        const freeMB = Math.max(0, (totalAllocatedMB - usedMB)).toFixed(2);
        const usedPercentage = Math.min(100, ((usedMB / totalAllocatedMB) * 100)).toFixed(1);

        const barSize = 16;
        const filled = Math.round((usedPercentage / 100) * barSize);
        const usageBar = '█'.repeat(filled) + '░'.repeat(Math.max(0, barSize - filled));

        const storedGuildIds = new Set();
        for (const col of collections) {
            if (col.name.startsWith('system.')) continue;
            const collection = db.collection(col.name);
            const ids1 = await collection.distinct('guildId');
            const ids2 = await collection.distinct('guild_id');
            ids1.forEach(id => { if (id && typeof id === 'string') storedGuildIds.add(id); });
            ids2.forEach(id => { if (id && typeof id === 'string') storedGuildIds.add(id); });
        }

        const uniqueGuildIds = Array.from(storedGuildIds);

        const embed = new EmbedBuilder()
            .setColor('#E67E22')
            .setTitle('💾 MongoDB Global Storage Monitor & Manager')
            .setDescription(
                `**Storage Usage:** \`${usedMB} MB\` / \`${totalAllocatedMB} MB\` (\`${usedPercentage}%\`)\n` +
                `\`[${usageBar}]\`\n` +
                `**Free Space Remaining:** \`${freeMB} MB\`\n` +
                `**Collections Count:** \`${stats.collections}\` | **Total Database Documents:** \`${stats.objects}\`\n\n` +
                `Select any server below to review its document breakdown or purge its data.`
            )
            .setThumbnail(client.user.displayAvatarURL())
            .setTimestamp();

        if (uniqueGuildIds.length === 0) {
            return message.reply({ embeds: [embed], content: 'ℹ️ No server data is currently stored in the database.' });
        }

        const options = uniqueGuildIds.slice(0, 25).map(gId => {
            const cachedGuild = client.guilds.cache.get(gId);
            const serverName = cachedGuild ? cachedGuild.name : `Inactive Guild (${gId})`;
            const statusTag = cachedGuild ? '🟢 Active' : '🔴 Bot Left';

            return {
                label: serverName.substring(0, 100),
                value: `storage_guild_${gId}`,
                description: `${statusTag} \vert{} ID:${gId}`
            };
        });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('owner_storage_server_select')
            .setPlaceholder('Select a server to view & manage database records...')
            .addOptions(options);

        return message.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(selectMenu)] });
    }

    // %mail (in Owner DM)
    if (message.channel.isDMBased() && isBotOwner && cmd === '%mail') {
        const mailEmbed = new EmbedBuilder()
            .setColor('#9B59B6')
            .setTitle('✉️ Bot Direct Mail Dispatcher')
            .setDescription('Click the button below to dispatch a direct message to any user via the bot.')
            .setFooter({ text: 'Authorized Bot Owners Only' })
            .setTimestamp();

        const mailRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('owner_trigger_mail_btn')
                .setLabel('Send Direct Mail')
                .setEmoji('📬')
                .setStyle(ButtonStyle.Primary)
        );

        return message.reply({ embeds: [mailEmbed], components: [mailRow] });
    }

    // %clear / %purge (in Owner DM)
    if (message.channel.isDMBased() && isBotOwner && (cmd === '%clear' || cmd === '%purge')) {
        const amount = parseInt(args[1], 10) || 10;
        const fetched = await message.channel.messages.fetch({ limit: Math.min(amount + 1, 100) });
        const botMessages = fetched.filter(m => m.author.id === client.user.id || m.id === message.id);

        for (const msg of botMessages.values()) {
            await msg.delete().catch(() => {});
        }
        return;
    }

    // %help (Universal Guide)
    if (cmd === '%help') {
        const helpEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('📖 Command Directory & System Guide')
            .setDescription('Overview of all slash commands, anti-nuke controls, and utility triggers.')
            .addFields(
                {
                    name: '👑 Bot Owner Controls (% prefix in DM)',
                    value: '• `%control` - Server browser, invite generator & force leave\n• `%manage` - Tier switcher & feature checklist\n• `%storage` - Database monitor & per-server cleaner\n• `%mail` - Send direct DM to any user via bot\n• `%clear <amount>` - DM conversation purge',
                    inline: false
                },
                {
                    name: '🛡️ Anti-Nuke & Ownership (% prefix)',
                    value: '• `%antinuke <enable/disable>` - Toggle protection\n• `%extraowner <add/remove> @user` - Manage extra owners\n• `%wl <add/remove> @user/@bot` - Manage whitelist\n• `%channel <allow/deny> <links/media/ips>` - Per-channel automod rules\n• `%backup <create/load/delete>` - Full architecture templates',
                    inline: false
                },
                {
                    name: '⚔️ Moderation Actions (/staff)',
                    value: '• `/staff action:ban/kick/timeout/untimeout/unban/purge/role_add/role_remove/lock/unlock/slowmode/warn`',
                    inline: false
                },
                {
                    name: '⚙️ Configuration & Core Systems (/panel)',
                    value: '• `/panel book:1` - Welcome, Ticket, Onboarding, Stats, Store\n• `/panel book:2` - Moderation, Auto Response, Voice Generator, Apply, YouTube\n• `/panel book:3` - Invite Tracker, Goodbye, Leveling, Bot Profile, Bot AI',
                    inline: false
                }
            )
            .setFooter({ text: 'Enterprise Security & Management System' })
            .setTimestamp();

        return message.reply({ embeds: [helpEmbed] });
    }

    // Music Prefix Commands
    if (await music.handleMessage(message, process.env.PREFIX || '%')) {
        return;
    }
});

// 6. Interactive Owner Control Listeners (All Button & Select Menu Interactions)
client.on('interactionCreate', async (interaction) => {
    if (!BOT_OWNERS.includes(interaction.user.id)) return;

    // Send Mail Modal Trigger
    if (interaction.isButton() && interaction.customId === 'owner_trigger_mail_btn') {
        const modal = new ModalBuilder()
            .setCustomId('owner_mail_modal')
            .setTitle('Direct Mail via Bot');

        const userIdInput = new TextInputBuilder()
            .setCustomId('mail_user_id')
            .setLabel('Target User ID')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter Discord User ID')
            .setRequired(true);

        const messageInput = new TextInputBuilder()
            .setCustomId('mail_text_content')
            .setLabel('Message Text')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Type your message here...')
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(userIdInput),
            new ActionRowBuilder().addComponents(messageInput)
        );

        return interaction.showModal(modal);
    }

    // Process Mail Submission
    if (interaction.isModalSubmit() && interaction.customId === 'owner_mail_modal') {
        await interaction.deferReply({ ephemeral: true });
        const targetUserId = interaction.fields.getTextInputValue('mail_user_id').trim();
        const mailContent = interaction.fields.getTextInputValue('mail_text_content');

        try {
            const targetUser = await client.users.fetch(targetUserId);
            if (!targetUser) {
                return interaction.editReply(`❌ User ID \`${targetUserId}\` could not be found.`);
            }

            await targetUser.send({ content: mailContent });
            return interaction.editReply(`✅ Direct message successfully delivered to **${targetUser.tag}** (\`${targetUserId}\`).`);
        } catch (err) {
            console.error('Mail Send Error:', err);
            return interaction.editReply('❌ Failed to deliver DM: The user may have DMs closed or provided ID is invalid.');
        }
    }

    // %control: Server Selected
    if (interaction.isStringSelectMenu() && interaction.customId === 'owner_select_server') {
        const guildId = interaction.values[0].replace('leave_guild_', '');
        const targetGuild = client.guilds.cache.get(guildId);

        if (!targetGuild) return interaction.reply({ content: '❌ Guild not found in cache.', ephemeral: true });

        let inviteUrl = null;
        try {
            const textChannel = targetGuild.channels.cache.find(c => 
                c.isTextBased() && 
                c.permissionsFor(targetGuild.members.me)?.has(PermissionFlagsBits.CreateInstantInvite)
            );
            if (textChannel) {
                const invite = await textChannel.createInvite({ maxAge: 86400, maxUses: 5, reason: 'Bot Owner Access' });
                inviteUrl = invite.url;
            }
        } catch (_) {}

        const serverEmbed = new EmbedBuilder()
            .setColor('#F1C40F')
            .setTitle(`🏢 Server: ${targetGuild.name}`)
            .addFields(
                { name: 'Server ID', value: `\`${targetGuild.id}\``, inline: true },
                { name: 'Owner', value: `<@${targetGuild.ownerId}> (\`${targetGuild.ownerId}\`)`, inline: true },
                { name: 'Members', value: `\`${targetGuild.memberCount}\``, inline: true },
                { name: 'Invite Link', value: inviteUrl ? `[Click to Join](${inviteUrl})` : '`No Invite Permission`', inline: false }
            )
            .setThumbnail(targetGuild.iconURL() || client.user.displayAvatarURL())
            .setTimestamp();

        const controlRow = new ActionRowBuilder();
        if (inviteUrl) {
            controlRow.addComponents(
                new ButtonBuilder().setLabel('Join Server').setStyle(ButtonStyle.Link).setURL(inviteUrl)
            );
        }

        controlRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`confirm_leave_${targetGuild.id}`)
                .setLabel('Leave This Server')
                .setStyle(ButtonStyle.Danger)
        );

        return interaction.reply({ embeds: [serverEmbed], components: [controlRow] });
    }

    // %control: Confirm Force Leave
    if (interaction.isButton() && interaction.customId.startsWith('confirm_leave_')) {
        const guildId = interaction.customId.replace('confirm_leave_', '');
        const targetGuild = client.guilds.cache.get(guildId);

        if (!targetGuild) return interaction.reply({ content: '❌ Guild not found.', ephemeral: true });

        const name = targetGuild.name;
        await targetGuild.leave();
        return interaction.update({ content: `✅ Successfully departed **${name}** (\`${guildId}\`).`, components: [] });
    }

    // %manage: Server Selected
    if (interaction.isStringSelectMenu() && interaction.customId === 'owner_manage_server_select') {
        const guildId = interaction.values[0].replace('manage_guild_', '');
        const panelData = await buildFeatureManager(guildId);
        return interaction.reply(panelData);
    }

    // %manage: Normal Features Master Toggle
    if (interaction.isButton() && interaction.customId.startsWith('toggle_normal_features_')) {
        const guildId = interaction.customId.replace('toggle_normal_features_', '');
        let settings = await ServerSettings.findOne({ guildId });
        if (!settings) settings = new ServerSettings({ guildId });

        settings.normalFeatures = !(settings.normalFeatures ?? true);
        await settings.save();

        const updatedPanel = await buildFeatureManager(guildId);
        return interaction.update(updatedPanel);
    }

    // %manage: Premium Features Toggle Checklist
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('multi_toggle_feature_')) {
        const guildId = interaction.customId.replace('multi_toggle_feature_', '');
        const selectedFeatures = interaction.values;

        let settings = await ServerSettings.findOne({ guildId });
        if (!settings) settings = new ServerSettings({ guildId });

        const allFeatureKeys = [
            'welcome', 'ticket', 'onboarding', 'stats', 'store', 
            'moderation', 'autoresponse', 'voicegen', 'apply', 
            'youtube', 'invite', 'goodbye', 'giveaway', 'music', 
            'leveling', 'botprofile', 'ai'
        ];

        allFeatureKeys.forEach(key => {
            settings.features[key] = selectedFeatures.includes(key);
        });

        settings.markModified('features');
        await settings.save();

        const updatedPanel = await buildFeatureManager(guildId);
        return interaction.update(updatedPanel);
    }

    // %storage: Server Footprint Details
    if (interaction.isStringSelectMenu() && interaction.customId === 'owner_storage_server_select') {
        await interaction.deferReply();
        const guildId = interaction.values[0].replace('storage_guild_', '');
        const targetGuild = client.guilds.cache.get(guildId);
        const guildName = targetGuild ? targetGuild.name : `Inactive Server (${guildId})`;
        const guildStatus = targetGuild ? '🟢 Currently Active' : '🔴 Bot has Left';

        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();

        let totalBytes = 0;
        let totalRecords = 0;
        const breakdown = [];

        for (const col of collections) {
            if (col.name.startsWith('system.')) continue;

            const collection = db.collection(col.name);
            const docs = await collection.find({
                $or: [{ guildId: guildId }, { guild_id: guildId }]
            }).toArray();

            if (docs.length > 0) {
                totalRecords += docs.length;
                let colBytes = 0;
                for (const doc of docs) {
                    colBytes += Buffer.byteLength(JSON.stringify(doc), 'utf8');
                }
                totalBytes += colBytes;
                breakdown.push(`• **${col.name}**: \`${docs.length}\` docs (~${(colBytes / 1024).toFixed(2)} KB)`);
            }
        }

        const sizeInKB = (totalBytes / 1024).toFixed(2);
        const sizeInMB = (totalBytes / (1024 * 1024)).toFixed(3);

        const storageEmbed = new EmbedBuilder()
            .setColor('#E67E22')
            .setTitle(`💾 Storage Footprint: ${guildName}`)
            .setDescription(breakdown.length > 0 ? breakdown.join('\n') : '*No database records found for this server.*')
            .addFields(
                { name: 'Server Status', value: `\`${guildStatus}\``, inline: true },
                { name: 'Total Documents', value: `\`${totalRecords}\``, inline: true },
                { name: 'Estimated Size', value: `\`${sizeInKB} KB\` (\`${sizeInMB} MB\`)`, inline: true },
                { name: 'Guild ID', value: `\`${guildId}\``, inline: false }
            )
            .setFooter({ text: 'Purging server data will permanently delete its configuration and stored logs!' })
            .setTimestamp();

        const actionRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`wipe_data_${guildId}`)
                .setLabel('Purge All Server Data')
                .setEmoji('🗑️')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(totalRecords === 0)
        );

        return interaction.editReply({ embeds: [storageEmbed], components: [actionRow] });
    }

    // %storage: Purge Guild Data
    if (interaction.isButton() && interaction.customId.startsWith('wipe_data_')) {
        const guildId = interaction.customId.replace('wipe_data_', '');
        await interaction.deferUpdate();

        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();
        let deletedTotal = 0;

        for (const col of collections) {
            if (col.name.startsWith('system.')) continue;
            const res = await db.collection(col.name).deleteMany({
                $or: [{ guildId: guildId }, { guild_id: guildId }]
            });
            deletedTotal += res.deletedCount;
        }

        const clearedEmbed = new EmbedBuilder()
            .setColor('#2ECC71')
            .setTitle('✅ Server Database Records Purged')
            .setDescription(`Successfully purged all database entries belonging to Guild ID: \`${guildId}\`.`)
            .addFields({ name: 'Total Documents Deleted', value: `\`${deletedTotal} documents\``, inline: true })
            .setTimestamp();

        return interaction.editReply({ embeds: [clearedEmbed], components: [] });
    }
});

// Database Connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB Connected to Atlas Cluster'))
    .catch(err => console.error('MongoDB Connection Error:', err));

client.login(process.env.DISCORD_TOKEN);
