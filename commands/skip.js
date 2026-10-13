const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Current gaana skip karein'),

    async execute(interaction) {
        const player = interaction.client.poru?.players.get(interaction.guildId);
        if (!player || !player.currentTrack) {
            return interaction.reply({ content: '❌ Abhi koi gaana play nahi ho raha hai.', ephemeral: true });
        }

        const title = player.currentTrack.info.title;
        player.stop();
        return interaction.reply(`⏭️ Skipped: **${title}**`);
    }
};
