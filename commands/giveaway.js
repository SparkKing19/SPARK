const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const Giveaway = require('../models/giveaway');

// Helper to parse duration like 10m, 2h, 1d ya HH:MM clock time
function parseTimeInput(input) {
    const durationMatch = input.match(/^(\d+)(m|h|d|s)$/i);
    if (durationMatch) {
        const val = parseInt(durationMatch[1], 10);
        const unit = durationMatch[2].toLowerCase();
        let ms = val * 1000;
        if (unit === 'm') ms = val * 60 * 1000;
        if (unit === 'h') ms = val * 60 * 60 * 1000;
        if (unit === 'd') ms = val * 24 * 60 * 60 * 1000;
        return new Date(Date.now() + ms);
    }

    const clockMatch = input.match(/^(\d{1,2}):(\d{2})$/);
    if (clockMatch) {
        const target = new Date();
        target.setHours(parseInt(clockMatch[1], 10), parseInt(clockMatch[2], 10), 0, 0);
        if (target.getTime() <= Date.now()) {
            target.setDate(target.getDate() + 1); // Next day same time
        }
        return target;
    }

    return null;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Host a server giveaway')
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
                .setDescription('End duration (e.g. 10m, 2h, 1d) or clock time (e.g. 18:30)')
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

        const endDate = parseTimeInput(rawTime);
        if (!endDate) {
            return interaction.reply({ 
                content: '❌ Invalid time format! Use `10m`, `2h`, `1d` ya clock time `18:30`.', 
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
        
        // Custom emoji reaction
        await giveawayMsg.react('<a:party_popper:1531251098738888734>').catch(async () => {
            // Fallback to unicode if custom emoji not accessible
            await giveawayMsg.react('🎉');
        });

        // Save in DB
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

        await interaction.reply({ content: `✅ Giveaway successfully started in ${channel}!`, ephemeral: true });
    }
};
