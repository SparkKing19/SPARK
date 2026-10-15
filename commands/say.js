const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const BOT_OWNERS = [
    '1549995551288852584', // FOUZAN
    '1266728371719508062', // FZBOY
    '1474216218792558735'  // DAREQUEEN
];

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
        ),
    async execute(interaction) {
        const isBotOwner = BOT_OWNERS.includes(interaction.user.id);
        const hasPerm = interaction.member.permissions.has(PermissionFlagsBits.ManageMessages);

        if (!isBotOwner && !hasPerm) {
            return interaction.reply({ content: '❌ You do not have permission to use `/say`.', ephemeral: true });
        }

        const text = interaction.options.getString('message').replace(/\\n/g, '\n');
        const isEmbed = interaction.options.getBoolean('embed') || false;

        if (isEmbed) {
            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setDescription(text)
                .setTimestamp();

            await interaction.channel.send({ embeds: [embed] });
        } else {
            await interaction.channel.send(text);
        }

        await interaction.reply({ content: '✅ Message sent successfully!', ephemeral: true });
    }
};
