const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const Giveaway = require('../models/giveaway');

const BOT_OWNERS = [
    '1549995551288852584', // FOUZAN
    '1266728371719508062', // FZBOY
    '1474216218792558735'  // DAREQUEEN
];

function parseISTClockTime(timeStr) {
    const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;

    const targetHour = parseInt(match[1], 10);
    const targetMin = parseInt(match[2], 10);

    if (targetHour < 0 || targetHour > 23 || targetMin < 0 || targetMin > 59) return null;

    const nowUtc = Date.now();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const nowIstDate = new Date(nowUtc + istOffset);

    const istYear = nowIstDate.getUTCFullYear();
    const istMonth = nowIstDate.getUTCMonth();
    const istDay = nowIstDate.getUTCDate();

    let targetUtcEpoch = Date.UTC(istYear, istMonth, istDay, targetHour, targetMin, 0) - istOffset;

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
        const isBotOwner = BOT_OWNERS.includes(interaction.user.id);
        const hasPerm = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);

        if (!isBotOwner && !hasPerm) {
            return interaction.reply({ content: '❌ You do not have permission to host giveaways.', ephemeral: true });
        }

        const channel = interaction.options.getChannel('channel');
        const reward = interaction.options.getString('reward');
        const winnerCount = interaction.options.getInteger('winners');
        const rawTime = interaction.options.getString('time');

        const endDate = parseISTClockTime(rawTime);
        if (!endDate) {
            return interaction.reply({ 
                content: '❌ Invalid time format! Use `HH:MM` format (e.g., `06:05`, `18:30`, `22:00`).', 
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

        await interaction.reply({ content: `✅ Giveaway started! Will end at **${rawTime} (IST)**.`, ephemeral: true });
    }
};
                
