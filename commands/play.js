const { SlashCommandBuilder } = require('discord.js');
const { QueryType } = require('discord-player');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Gaana play karo ya queue me add karo (YouTube, Spotify, SoundCloud)')
        .addStringOption(opt => 
            opt.setName('query')
                .setDescription('Gaane ka naam ya URL daalo')
                .setRequired(true)
        ),

    async execute(interaction) {
        const player = interaction.client.player;
        const channel = interaction.member.voice.channel;

        if (!channel) {
            return interaction.reply({ content: '❌ Pehle kisi Voice Channel me connect ho jao!', ephemeral: true });
        }

        await interaction.deferReply();
        const query = interaction.options.getString('query');

        try {
            // Auto search resolver (YouTube Search fallback)
            const result = await player.search(query, {
                requestedBy: interaction.user,
                searchEngine: QueryType.AUTO
            });

            if (!result || !result.tracks.length) {
                return interaction.editReply(`❌ Koi gaana nahi mila: **${query}**`);
            }

            const { track } = await player.play(channel, result, {
                nodeOptions: {
                    metadata: {
                        channel: interaction.channel,
                        client: interaction.guild.members.me,
                        requestedBy: interaction.user
                    },
                    volume: 80,
                    leaveOnEmpty: true,
                    leaveOnEmptyCooldown: 60000,
                    leaveOnEnd: true,
                    leaveOnEndCooldown: 60000
                }
            });

            return interaction.editReply(`✅ Added to Queue: **${track.title}** (\`${track.duration}\`)`);
        } catch (err) {
            console.error('Play command error:', err);
            return interaction.editReply(`❌ Play karne me error aayi: \`${err.message}\``);
        }
    }
};
