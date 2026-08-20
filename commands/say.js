const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('say')
        .setDescription('Make the bot send a custom message')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('The message you want the bot to say')
                .setRequired(true)
        )
        .addBooleanOption(option =>
            option.setName('embed')
                .setDescription('Should the message be sent inside an embed? (True/False)')
                .setRequired(false)
        )
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Target channel (defaults to current channel)')
                .setRequired(false)
        ),
    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({ content: '❌ Aapke paas `/say` use karne ki permission nahi hai.', ephemeral: true });
        }

        const text = interaction.options.getString('message').replace(/\\n/g, '\n');
        const isEmbed = interaction.options.getBoolean('embed') || false;
        const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

        if (isEmbed) {
            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setDescription(text)
                .setTimestamp();

            await targetChannel.send({ embeds: [embed] });
        } else {
            await targetChannel.send(text);
        }

        await interaction.reply({ content: `✅ Message sent to ${targetChannel}!`, ephemeral: true });
    }
};
