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

client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (command) {
            try {
                await command.execute(interaction);
            } catch (err) {
                console.error(`Error executing command ${interaction.commandName}:`, err);
            }
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

    // Startup DM alert to both Bot Owners
    const startupEmbed = new EmbedBuilder()
        .setColor('#2ECC71')
        .setTitle('🟢 Bot Online Notification')
        .setDescription(`**${client.user.tag}** has successfully initialized and is now active across **${client.guilds.cache.size} servers**.`)
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

// 4. Bot Owner DM Controls (!control, %clear) & %help System
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const isBotOwner = BOT_OWNERS.includes(message.author.id);
    const content = message.content.trim();
    const args = content.split(/ +/);
    const cmd = args[0]?.toLowerCase();

    // A. Bot Owner DM Control Panel (!control)
    if (message.channel.isDMBased() && isBotOwner && cmd === '!control') {
        const guilds = Array.from(client.guilds.cache.values());
        if (guilds.length === 0) {
            return message.reply('❌ The bot is not currently present in any servers.');
        }

        const options = guilds.slice(0, 25).map(g => ({
            label: g.name.substring(0, 100),
            value: `leave_guild_${g.id}`,
            description: `Members: ${g.memberCount} | ID: ${g.id}`
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('owner_select_server')
            .setPlaceholder('Select a server to manage...')
            .addOptions(options);

        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('⚙️ Bot Owner Control Center')
            .setDescription('Select a server from the dropdown below to view details and manage server actions.')
            .addFields(
                { name: '📊 Total Servers', value: `\`${client.guilds.cache.size}\``, inline: true },
                { name: '👥 Total Users', value: `\`${client.users.cache.size}\``, inline: true }
            )
            .setTimestamp();

        return message.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(selectMenu)] });
    }

    // B. DM Message Cleaner (%clear <amount>)
    if (message.channel.isDMBased() && isBotOwner && (cmd === '%clear' || cmd === '%purge')) {
        const amount = parseInt(args[1], 10) || 10;
        const fetched = await message.channel.messages.fetch({ limit: Math.min(amount + 1, 100) });
        const botMessages = fetched.filter(m => m.author.id === client.user.id || m.id === message.id);

        for (const msg of botMessages.values()) {
            await msg.delete().catch(() => {});
        }
        return;
    }

    // C. Global %help Command (Lists all Prefix & Slash Commands)
    if (cmd === '%help') {
        const helpEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('📖 Command Directory & System Guide')
            .setDescription('Overview of available slash commands, anti-nuke controls, and utility prefix triggers.')
            .addFields(
                {
                    name: '🛡️ Anti-Nuke & Ownership (% prefix)',
                    value: '• `%antinuke <enable/disable>` - Toggle protection system\n• `%extraowner <add/remove> @user` - Manage extra owners\n• `%wl <add/remove> @user/@bot` - Manage whitelist\n• `%pr @user` - Open interactive command permissions panel\n• `%channel <allow/deny> <links/media/ips>` - Set channel-specific automod rules',
                    inline: false
                },
                {
                    name: '⚔️ Moderation Actions (/staff)',
                    value: '• `/staff action:ban`\n• `/staff action:kick`\n• `/staff action:timeout`\n• `/staff action:untimeout`\n• `/staff action:unban`\n• `/staff action:purge`\n• `/staff action:role_add`\n• `/staff action:role_remove`\n• `/staff action:lock`\n• `/staff action:unlock`\n• `/staff action:slowmode`\n• `/staff action:warn`',
                    inline: false
                },
                {
                    name: '⚙️ Configuration & Core Systems (/panel)',
                    value: '• `/panel book:1` - Welcome, Ticket, Onboarding, Stats, Store\n• `/panel book:2` - Moderation, Auto Response, Voice Generator, Apply, YouTube\n• `/panel book:3` - Invite Tracker\n• `/say message: [embed:true/false]` - Make bot send custom message',
                    inline: false
                },
                {
                    name: '📊 Invite Commands (& prefix)',
                    value: '• `&i` or `&i @user` - Check invite statistics\n• `&lb` - Display top 10 invite leaderboard',
                    inline: false
                }
            )
            .setFooter({ text: 'Enterprise Security & Management System' })
            .setTimestamp();

        return message.reply({ embeds: [helpEmbed] });
    }
});

// 5. Bot Owner Interactions (Server Selection & Leave Execution)
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isStringSelectMenu() && !interaction.isButton()) return;
    if (!BOT_OWNERS.includes(interaction.user.id)) return;

    // Dropdown Selection: Show Server Card & Leave Button
    if (interaction.isStringSelectMenu() && interaction.customId === 'owner_select_server') {
        const guildId = interaction.values[0].replace('leave_guild_', '');
        const targetGuild = client.guilds.cache.get(guildId);

        if (!targetGuild) {
            return interaction.reply({ content: '❌ Guild not found or bot has already departed.', ephemeral: true });
        }

        const serverEmbed = new EmbedBuilder()
            .setColor('#F1C40F')
            .setTitle(`🏢 Server: ${targetGuild.name}`)
            .addFields(
                { name: 'Server ID', value: `\`${targetGuild.id}\``, inline: true },
                { name: 'Owner', value: `<@${targetGuild.ownerId}> (\`${targetGuild.ownerId}\`)`, inline: true },
                { name: 'Members', value: `\`${targetGuild.memberCount}\``, inline: true }
            )
            .setThumbnail(targetGuild.iconURL())
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

    // Leave Button Action
    if (interaction.isButton() && interaction.customId.startsWith('confirm_leave_')) {
        const guildId = interaction.customId.replace('confirm_leave_', '');
        const targetGuild = client.guilds.cache.get(guildId);

        if (!targetGuild) {
            return interaction.reply({ content: '❌ Guild not found in bot cache.', ephemeral: true });
        }

        const guildName = targetGuild.name;
        await targetGuild.leave();

        const successRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('left_success')
                .setLabel(`Left ${guildName}`)
                .setEmoji('<a:CONFIRM:1540171582817968148>')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
        );

        return interaction.update({ content: `✅ Successfully departed **${guildName}** (\`${guildId}\`).`, components: [successRow] });
    }
});

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.error('MongoDB Connection Error:', err));

client.login(process.env.DISCORD_TOKEN);
