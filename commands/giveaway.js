const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const Giveaway = require('../models/giveaway');

// Helper: Exact Clock Time Parser (HH:MM -> Exact Target Timestamp)
function parseClockTime(timeStr) {
    const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;

    const targetHour = parseInt(match[1], 10);
    const targetMin = parseInt(match[2], 10);

    if (targetHour < 0 || targetHour > 23 || targetMin < 0 || targetMin > 59) return null;

    // Current time in IST / Local
    const now = new Date();
    
    // Target date object
    const targetDate = new Date(now);
    targetDate.setHours(targetHour, targetMin, 0, 0);

    // Agar target time current time se pehle ka hai (e.g. abhi 23:00 hai aur 02:00 diya), to agle din ka set karo
    if (targetDate.getTime() <= now.getTime()) {
        targetDate.setDate(targetDate.getDate() + 1);
    }

    return targetDate;
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
                .setDescription('Exact end time in 24-hr format (e.g. 06:05, 18:30, 22:00)')
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

        const endDate = parseClockTime(rawTime);
        if (!endDate) {
            return interaction.reply({ 
                content: '❌ Invalid time format! Format `HH:MM` use karein (jaise: `06:05`, `14:30`, `23:00`).', 
                ephemeral: true 
            });
        }

        const endTimestamp = Math.floor(endDate.getTime() / 1000);

        const giveawayEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setDescription(
`<a:gift:1531251179235840051> GIVEAWAY STARTED <a:gift:1531251179235840051>

⟢ Hosted By    : <@${interaction.user.id}>
⟢ Reward       : ${reward}
⟢ Winners      : ${winnerCount}
⟢ Ends         : <t:${endTimestamp}:R>

────────────────────

➥ React with <a:party_popper:1531251098738888734> to enter the giveaway!`
            );

        const giveawayMsg = await channel.send({ embeds: [giveawayEmbed] });
        
        await giveawayMsg.react('<a:party_popper:1531251098738888734>').catch(async () => {
            await giveawayMsg.react('🎉');
        });

        // Save into MongoDB
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

        await interaction.reply({ content: `✅ Giveaway started! Exact **${rawTime}** par end hoga.`, ephemeral: true });
    }
};
