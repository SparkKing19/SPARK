const { EmbedBuilder } = require('discord.js');
const Giveaway = require('../models/giveaway');

async function endGiveaway(client, g) {
    await Giveaway.updateOne({ _id: g._id }, { ended: true });

    const guild = client.guilds.cache.get(g.guildId);
    if (!guild) return;

    const channel = guild.channels.cache.get(g.channelId);
    if (!channel) return;

    const message = await channel.messages.fetch(g.messageId).catch(() => null);
    if (!message) return;

    // Fetch reactions and filter out bots
    const reaction = message.reactions.cache.get('1531251098738888734') || message.reactions.cache.get('🎉');
    let validUsers = [];

    if (reaction) {
        const users = await reaction.users.fetch();
        validUsers = users.filter(u => !u.bot).map(u => u.id);
    }

    // Pick Winners
    const winners = [];
    if (validUsers.length > 0) {
        const shuffled = validUsers.sort(() => 0.5 - Math.random());
        const picked = shuffled.slice(0, g.winnerCount);
        winners.push(...picked);
    }

    const winnersText = winners.length > 0 
        ? winners.map(w => `▸ <@${w}>`).join('\n') 
        : '▸ No valid entries found.';

    const endedEmbed = new EmbedBuilder()
        .setColor('#ED4245')
        .setDescription(
`<a:gift:1531251179235840051> GIVEAWAY ENDED <a:gift:1531251179235840051>

⟢ Reward       : ${g.reward}
⟢ Total Winners: ${g.winnerCount}

────────────────────

<a:trophy:1531251182713045023> **WINNERS**
${winnersText}

────────────────────

<a:celebration:1531251175721009242> Congratulations to all the winners!`
        );

    await message.edit({ embeds: [endedEmbed] }).catch(console.error);

    if (winners.length > 0) {
        await channel.send({ 
            content: `🎉 Congratulations ${winners.map(w => `<@${w}>`).join(', ')}! You won **${g.reward}**!` 
        });
    } else {
        await channel.send({ content: `⚠️ Giveaway for **${g.reward}** ended with no entries.` });
    }
}

module.exports = (client) => {
    // 5-second interval loop to check and end due giveaways
    setInterval(async () => {
        try {
            const now = new Date();
            const pendingGiveaways = await Giveaway.find({ ended: false, endsAt: { $lte: now } });

            for (const g of pendingGiveaways) {
                await endGiveaway(client, g);
            }
        } catch (err) {
            console.error('Giveaway checker error:', err);
        }
    }, 5000);

    console.log('✔ Giveaway handler loaded.');
};
