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
    ButtonStyle 
} = require('discord.js');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const ServerSettings = require('./models/serverSettings');
const ModerationConfig = require('./models/moderation');

// Bot Owner IDs
const BOT_OWNERS = ['1266728371719508062', '1474216218792558735'];

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

client.commands = new Map();

// 1. Auto-load Slash Commands
const commandsArray = [];
const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    if (command?.data?.name) {
        client.commands.set(command.data.name, command);
        commandsArray.push(command.data.toJSON());
    }
}

// Global Command Security Guard
client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        const isBotOwner = BOT_OWNERS.includes(interaction.user.id);
        const isServerOwner = interaction.guild && interaction.user.id === interaction.guild.ownerId;

        let isExtraOwner = false;
        if (interaction.guild) {
            const modCfg = await ModerationConfig.findOne({ guildId: interaction.guild.id });
            if (modCfg?.extraOwners?.includes(interaction.user.id)) isExtraOwner = true;
        }

        if (!isBotOwner && !isServerOwner && !isExtraOwner) {
            return interaction.reply({
                content: '❌ Access Denied: Command execution is strictly restricted to Bot Owners, Server Owner, and Extra Owners.',
                ephemeral: true
            });
        }

        try {
            await command.execute(interaction);
        } catch (err) {
            console.error(`Error executing command ${interaction.commandName}:`, err);
        }
    }
});

// 2. Auto-load All Feature Handlers
const handlerFiles = fs.readdirSync(path.join(__dirname, 'handlers')).filter(file => file.endsWith('.js'));
for (const file of handlerFiles) {
    require(`./handlers/${file}`)(client);
}

// 3. Ready & Startup DM Notifications
client.once('ready', async () => {
    console.log(`🚀 Bot is Online: ${client.user.tag}`);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commandsArray }
        );
        console.log('✅ Slash Commands Registered Successfully.');
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

// Helper: Convert Image URL to Base64 Data URI
async function urlToBase64(url) {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get('content-type') || 'image/png';
    return `data:${contentType};base64,${buffer.toString('base64')}`;
}

// Helper: Build Multi-Select Feature Manager & Server Avatar Card
async function buildFeatureManager(guildId) {
    let settings = await ServerSettings.findOne({ guildId });
    if (!settings) settings = await ServerSettings.create({ guildId });

    const guild = client.guilds.cache.get(guildId);
    const f = settings.features;

    const botMember = guild ? await guild.members.fetch(client.user.id).catch(() => null) : null;
    const currentAvatar = botMember ? botMember.displayAvatarURL() : client.user.displayAvatarURL();

    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(`🛠️ Feature & Profile Manager: ${guild ? guild.name : guildId}`)
        .setDescription('Toggle features on/off and switch the bot\'s server profile avatar.')
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
            { name: 'Server Profile Avatar Status', value: settings.customLogoUrl ? '`Using Server Icon as Avatar` 🖼️' : '`Using Global Bot Avatar` 🤖', inline: false }
        )
        .setThumbnail(currentAvatar)
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
        { label: 'Giveaway System', value: 'giveaway' }
    ];

    const options = featureKeys.map(item => ({
        label: item.label,
        value: item.value,
        description: `Check to enable ${item.label}`,
        default: Boolean(f[item.value])
    }));

    const multiSelectMenu = new StringSelectMenuBuilder()
        .setCustomId(`multi_toggle_feature_${guildId}`)
        .setPlaceholder('Select enabled features (Multi-Select Checklist)...')
        .setMinValues(0)
        .setMaxValues(options.length)
        .addOptions(options);

    const logoBtn = new ButtonBuilder()
        .setCustomId(`toggle_logo_${guildId}`)
        .setLabel(settings.customLogoUrl ? 'Reset to Global Bot Profile' : 'Apply Server Icon to Bot Profile')
        .setStyle(settings.customLogoUrl ? ButtonStyle.Danger : ButtonStyle.Primary);

    return {
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(multiSelectMenu),
            new ActionRowBuilder().addComponents(logoBtn)
        ]
    };
}

// 4. Bot Owner DM Commands (%control, %manage, %storage, %clear) & %help System
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const isBotOwner = BOT_OWNERS.includes(message.author.id);
    const content = message.content.trim();
    const args = content.split(/ +/);
    const cmd = args[0]?.toLowerCase();

    // A. Bot Owner Control Center (%control in DM)
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
            .setDescription('Select a server from the dropdown to view details or force leave.')
            .addFields(
                { name: '🤖 Bot Tag', value: `\`${client.user.tag}\``, inline: true },
                { name: '📊 Servers', value: `\`${client.guilds.cache.size}\``, inline: true },
                { name: '👥 Total Users', value: `\`${client.users.cache.size}\``, inline: true }
            )
            .setThumbnail(client.user.displayAvatarURL())
            .setTimestamp();

        return message.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(selectMenu)] });
    }

    // B. Bot Owner Feature Manager (%manage in DM)
    if (message.channel.isDMBased() && isBotOwner && cmd === '%manage') {
        const guilds = Array.from(client.guilds.cache.values());
        if (guilds.length === 0) return message.reply('❌ The bot is not currently in any servers.');

        const options = guilds.slice(0, 25).map(g => ({
            label: g.name.substring(0, 100),
            value: `manage_guild_${g.id}`,
            description: `Configure features & profile for ${g.name}`
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('owner_manage_server_select')
            .setPlaceholder('Select server to configure features & avatar...')
            .addOptions(options);

        const embed = new EmbedBuilder()
            .setColor('#2ECC71')
            .setTitle('🛠️ Bot Features & Guild Profile Manager')
            .setDescription('Choose a server from the dropdown to configure its active modules and change the bot\'s server profile avatar.')
            .setThumbnail(client.user.displayAvatarURL())
            .setTimestamp();

        return message.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(selectMenu)] });
    }

        // C. Bot Owner Database Storage Inspector (%storage in DM)
    if (message.channel.isDMBased() && isBotOwner && cmd === '%storage') {
        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();

        // Database me jitne bhi unique guildIds hain unko collect karo
        const storedGuildIds = new Set();

        for (const col of collections) {
            if (col.name.startsWith('system.')) continue;
            const collection = db.collection(col.name);

            // Dono patterns check: guildId aur guild_id
            const ids1 = await collection.distinct('guildId');
            const ids2 = await collection.distinct('guild_id');

            ids1.forEach(id => { if (id && typeof id === 'string') storedGuildIds.add(id); });
            ids2.forEach(id => { if (id && typeof id === 'string') storedGuildIds.add(id); });
        }

        const uniqueGuildIds = Array.from(storedGuildIds);

        if (uniqueGuildIds.length === 0) {
            return message.reply('ℹ️ Database me kisi bhi server ka koi data maujood nahi hai.');
        }

        // Dropdown menu ke options build karein (Max 25 allowed by Discord)
        const options = uniqueGuildIds.slice(0, 25).map(gId => {
            const cachedGuild = client.guilds.cache.get(gId);
            const serverName = cachedGuild ? cachedGuild.name : `Left Guild (${gId})`;
            const statusTag = cachedGuild ? '🟢 In Server' : '🔴 Bot Left';

            return {
                label: serverName.substring(0, 100),
                value: `storage_guild_${gId}`,
                description: `${statusTag} \vert{} ID:${gId}`
            };
        });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('owner_storage_server_select')
            .setPlaceholder('Select a server having DB records...')
            .addOptions(options);

        const embed = new EmbedBuilder()
            .setColor('#E67E22')
            .setTitle('💾 MongoDB Stored Servers Directory')
            .setDescription(`Found **${uniqueGuildIds.length} server(s)** with active records in the database.\nServers marked as **🔴 Bot Left** are no longer hosting the bot but still consume MongoDB storage.`)
            .setThumbnail(client.user.displayAvatarURL())
            .setTimestamp();

        return message.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(selectMenu)] });
    }

    // D. DM Message Purge (%clear <amount>)
    if (message.channel.isDMBased() && isBotOwner && (cmd === '%clear' || cmd === '%purge')) {
        const amount = parseInt(args[1], 10) || 10;
        const fetched = await message.channel.messages.fetch({ limit: Math.min(amount + 1, 100) });
        const botMessages = fetched.filter(m => m.author.id === client.user.id || m.id === message.id);

        for (const msg of botMessages.values()) {
            await msg.delete().catch(() => {});
        }
        return;
    }

    // E. %help Command
    if (cmd === '%help') {
        const helpEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('📖 Command Directory & System Guide')
            .setDescription('Overview of available slash commands, anti-nuke controls, and utility prefix triggers.')
            .addFields(
                {
                    name: '👑 Bot Owner Controls (% prefix in DM)',
                    value: '• `%control` - Server list, bot profile & force leave\n• `%manage` - Multi-select feature checklist & Server Avatar changer\n• `%storage` - View server MongoDB usage & wipe data\n• `%clear <amount>` - DM message cleaner',
                    inline: false
                },
                {
                    name: '🛡️ Anti-Nuke & Ownership (% prefix)',
                    value: '• `%antinuke <enable/disable>` - Toggle protection\n• `%extraowner <add/remove> @user` - Manage extra owners\n• `%wl <add/remove> @user/@bot` - Manage whitelist\n• `%pr @user` - Interactive command permissions panel\n• `%channel <allow/deny> <links/media/ips>` - Channel automod rules',
                    inline: false
                },
                {
                    name: '⚔️ Moderation Actions (/staff)',
                    value: '• `/staff action:ban/kick/timeout/untimeout/unban/purge/role_add/role_remove/lock/unlock/slowmode/warn`',
                    inline: false
                },
                {
                    name: '⚙️ Configuration & Core Systems (/panel)',
                    value: '• `/panel book:1` - Welcome, Ticket, Onboarding, Stats, Store\n• `/panel book:2` - Moderation, Auto Response, Voice Generator, Apply, YouTube\n• `/panel book:3` - Invite Tracker, Goodbye System',
                    inline: false
                }
            )
            .setFooter({ text: 'Enterprise Security & Management System' })
            .setTimestamp();

        return message.reply({ embeds: [helpEmbed] });
    }
});

// 5. Bot Owner Interactive Handlers
client.on('interactionCreate', async (interaction) => {
    if (!BOT_OWNERS.includes(interaction.user.id)) return;

    // A. %control: Server Select
    if (interaction.isStringSelectMenu() && interaction.customId === 'owner_select_server') {
        const guildId = interaction.values[0].replace('leave_guild_', '');
        const targetGuild = client.guilds.cache.get(guildId);

        if (!targetGuild) return interaction.reply({ content: '❌ Guild not found.', ephemeral: true });

        const serverEmbed = new EmbedBuilder()
            .setColor('#F1C40F')
            .setTitle(`🏢 Server: ${targetGuild.name}`)
            .addFields(
                { name: 'Server ID', value: `\`${targetGuild.id}\``, inline: true },
                { name: 'Owner', value: `<@${targetGuild.ownerId}> (\`${targetGuild.ownerId}\`)`, inline: true },
                { name: 'Members', value: `\`${targetGuild.memberCount}\``, inline: true }
            )
            .setThumbnail(targetGuild.iconURL() || client.user.displayAvatarURL())
            .setFooter({ text: `Bot Tag: ${client.user.tag}`, iconURL: client.user.displayAvatarURL() })
            .setTimestamp();

        const leaveRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`confirm_leave_${targetGuild.id}`)
                .setLabel('Leave This Server')
                .setEmoji('<a:ALERT:1540171495022530701>')
                .setStyle(ButtonStyle.Danger)
        );

        return interaction.reply({ embeds: [serverEmbed], components: [leaveRow] });
    }

    // B. %control: Confirm Leave
    if (interaction.isButton() && interaction.customId.startsWith('confirm_leave_')) {
        const guildId = interaction.customId.replace('confirm_leave_', '');
        const targetGuild = client.guilds.cache.get(guildId);

        if (!targetGuild) return interaction.reply({ content: '❌ Guild not found in bot cache.', ephemeral: true });

        const guildName = targetGuild.name;
        await targetGuild.leave();

        return interaction.update({ content: `✅ Successfully departed **${guildName}** (\`${guildId}\`).`, components: [] });
    }

    // C. %manage: Select Server
    if (interaction.isStringSelectMenu() && interaction.customId === 'owner_manage_server_select') {
        const guildId = interaction.values[0].replace('manage_guild_', '');
        const panelData = await buildFeatureManager(guildId);
        return interaction.reply(panelData);
    }

    // D. %manage: Multi-Select Feature Checklist Handler
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('multi_toggle_feature_')) {
        const guildId = interaction.customId.replace('multi_toggle_feature_', '');
        const selectedFeatures = interaction.values;

        let settings = await ServerSettings.findOne({ guildId });
        if (!settings) settings = new ServerSettings({ guildId });

        const allFeatureKeys = [
            'welcome', 'ticket', 'onboarding', 'stats', 'store', 
            'moderation', 'autoresponse', 'voicegen', 'apply', 
            'youtube', 'invite', 'goodbye', 'giveaway'
        ];

        allFeatureKeys.forEach(key => {
            settings.features[key] = selectedFeatures.includes(key);
        });

        settings.markModified('features');
        await settings.save();

        const updatedPanel = await buildFeatureManager(guildId);
        return interaction.update(updatedPanel);
    }

    // E. %manage: Real Server Profile Avatar Change (via REST API)
    if (interaction.isButton() && interaction.customId.startsWith('toggle_logo_')) {
        const guildId = interaction.customId.replace('toggle_logo_', '');
        const targetGuild = client.guilds.cache.get(guildId);

        if (!targetGuild) return interaction.reply({ content: '❌ Guild not found.', ephemeral: true });

        await interaction.deferUpdate();

        let settings = await ServerSettings.findOne({ guildId });
        if (!settings) settings = new ServerSettings({ guildId });

        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

        try {
            if (settings.customLogoUrl) {
                await rest.patch(Routes.guildMember(guildId, '@me'), {
                    body: { avatar: null }
                });
                settings.customLogoUrl = null;
            } else {
                const guildIconUrl = targetGuild.iconURL({ extension: 'png', size: 1024 });
                if (!guildIconUrl) {
                    return interaction.followUp({ content: '❌ This server does not have an icon set.', ephemeral: true });
                }

                const base64Avatar = await urlToBase64(guildIconUrl);
                await rest.patch(Routes.guildMember(guildId, '@me'), {
                    body: { avatar: base64Avatar }
                });

                settings.customLogoUrl = guildIconUrl;
            }

            await settings.save();
            const updatedPanel = await buildFeatureManager(guildId);
            return interaction.editReply(updatedPanel);
        } catch (err) {
            console.error('Server Avatar Update Error:', err);
            return interaction.followUp({ 
                content: `❌ Failed to update Server Avatar: \`${err.message}\` (Ensure bot has Change Nickname/Guild Profile permissions).`, 
                ephemeral: true 
            });
        }
    }

        // F. %storage: Select Server & Calculate Database Footprint
    if (interaction.isStringSelectMenu() && interaction.customId === 'owner_storage_server_select') {
        await interaction.deferReply();
        const guildId = interaction.values[0].replace('storage_guild_', '');
        const targetGuild = client.guilds.cache.get(guildId);
        const guildName = targetGuild ? targetGuild.name : `Left Server (${guildId})`;
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
                { name: 'Status', value: `\`${guildStatus}\``, inline: true },
                { name: 'Total Documents', value: `\`${totalRecords}\``, inline: true },
                { name: 'Total Size', value: `\`${sizeInKB} KB\` (\`${sizeInMB} MB\`)`, inline: true },
                { name: 'Server ID', value: `\`${guildId}\``, inline: false }
            )
            .setFooter({ text: 'Warning: Clearing data will permanently remove all server configurations!' })
            .setTimestamp();

        const actionRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`wipe_data_${guildId}`)
                .setLabel('Clear All Server Data')
                .setEmoji('🗑️')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(totalRecords === 0)
        );

        return interaction.editReply({ embeds: [storageEmbed], components: [actionRow] });
    }

    // G. %storage: Clear / Wipe Server MongoDB Data
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
            .setTitle('✅ Server Database Wiped')
            .setDescription(`Successfully cleared all database records belonging to Guild ID: \`${guildId}\`.`)
            .addFields({ name: 'Total Records Deleted', value: `\`${deletedTotal} documents\``, inline: true })
            .setTimestamp();

        return interaction.editReply({ embeds: [clearedEmbed], components: [] });
    }
});

// Database Connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB Connected to Atlas'))
    .catch(err => console.error('MongoDB Connection Error:', err));

client.login(process.env.DISCORD_TOKEN);
