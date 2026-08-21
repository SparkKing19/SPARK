const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const mongoose = require('mongoose');
const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates // <-- Ye intent zaroori hai Voice events ke liye
    ]
});
client.commands = new Map();

// 1. Auto-load Slash Commands
const commandsArray = [];
const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    client.commands.set(command.data.name, command);
    commandsArray.push(command.data.toJSON());
}

client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (command) await command.execute(interaction);
    }
});

// 2. Auto-load All Feature Handlers
const handlerFiles = fs.readdirSync(path.join(__dirname, 'handlers')).filter(file => file.endsWith('.js'));
for (const file of handlerFiles) {
    require(`./handlers/${file}`)(client);
}

// Ready & Database
client.once('ready', async () => {
    console.log(`🚀 Bot is Online: ${client.user.tag}`);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        // client.user.id use karne se CLIENT_ID variable ki zaroorat nahi padegi
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commandsArray }
        );
        console.log('✅ Slash Commands Registered Successfully.');
    } catch (err) {
        console.error('Command Registration Error:', err);
    }
});

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.error('MongoDB Connection Error:', err));

client.login(process.env.DISCORD_TOKEN);
