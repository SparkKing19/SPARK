const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const Giveaway = require('../models/giveaway');

// Helper: Parse Indian Standard Time (IST - UTC+5:30)
function parseISTClockTime(timeStr) {
    const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;

    const targetHour = parseInt(match[1], 10);
    const targetMin = parseInt(match[2], 10);

    if (targetHour < 0 || targetHour > 23 || targetMin < 0 || targetMin > 59) return null;

    // Current time in IST
    const nowUtc = Date.now();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const nowIstDate = new Date(nowUtc + istOffset);

    const istYear = nowIstDate.getUTCFullYear();
    const istMonth = nowIstDate.getUTCMonth();
    const istDay = nowIstDate.getUTCDate();

    // Create target time in IST (treated as UTC internally, then subtract offset)
    let targetUtcEpoch = Date.UTC(istYear, istMonth, istDay, targetHour, targetMin, 0) - istOffset;

    // Agar time pehle hi nikal chuka hai toh agle din ka target banao
    if (targetUtcEpoch <= nowUtc) {
        targetUtcEpoch += 24 * 60 * 60 * 1000;
    }

    return new Date(targetUtcEpoch);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Host a real-time giveaway')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel where giveaway will be posted')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('reward')
                .setDescription('Prize / Reward for the giveaway')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName('winners')
                .setDescription('Number of winners')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('time')
                .setDescription('Exact end time in IST (e.g. 06:05, 18:30, 22:00)')
                .setRequired(true)
        ),
    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({ content: '❌ Aapke paas giveaway host karne ki permission nahi hai.', ephemeral: true });
        }

        const channel = interaction.options.getChannel('channel');
        const reward = interaction.options.getString('reward');
        const winnerCount = interaction.options.getInteger('winners');
        const rawTime = interaction.options.getString('time');

        const endDate = parseISTClockTime(rawTime);
        if (!endDate) {
            return interaction.reply({ 
                content: '❌ Invalid time format! Format `HH:MM` use karein (jaise: `06:05`, `18:30`, `22:00`).', 
                ephemeral: true 
            });
        }

        const endTimestamp = Math.floor(endDate.getTime() / 1000);

        const giveawayEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setDescription(
`<a:GIFT_BOX:1540171626232942593> GIVEAWAY STARTED <a:GIFT_BOX:1540171626232942593>

⟢ Hosted By    : <@${interaction.user.id}>
⟢ Reward       : ${reward}
⟢ Winners      : ${winnerCount}
⟢ Ends         : <t:${endTimestamp}:R>

────────────────────

➥ React with <a:PARTY_POPPER:1540171562156822660> to enter the giveaway!`
            );

        const giveawayMsg = await channel.send({ embeds: [giveawayEmbed] });
        
        await giveawayMsg.react('<a:PARTY_POPPER:1540171562156822660>').catch(async () => {
            await giveawayMsg.react('🎉');
        });

        // Save in MongoDB
        await Giveaway.create({
            guildId: interaction.guild.id,
            channelId: channel.id,
            messageId: giveawayMsg.id,
            hostId: interaction.user.id,
            reward,
            winnerCount,
            endsAt: endDate,
            ended: false
        });

        await interaction.reply({ content: `✅ Giveaway started! Exact **${rawTime} (IST)** par end hoga.`, ephemeral: true });
    }
};
