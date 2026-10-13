const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const Music247 = require('../models/music247');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('join')
        .setDescription('Bot ko Voice Channel me bulayein ya 24/7 mode enable karein')
        .addBooleanOption(opt => 
            opt.setName('mode_247')
                .setDescription('Kya bot ko 24/7 is VC me online rakhna hai? (true/false)')
                .setRequired(false)
        ),

    async execute(interaction) {
        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
            return interaction.reply({ content: '❌ Pehle kisi Voice Channel me join karein!', ephemeral: true });
        }

        const mode247 = interaction.options.getBoolean('mode_247');
        const player = interaction.client.player;

        // Ensure active queue / connection
        let queue = player.nodes.get(interaction.guildId);
        if (!queue) {
            queue = player.nodes.create(interaction.guild, {
                metadata: {
                    channel: interaction.channel,
                    client: interaction.guild.members.me,
                    requestedBy: interaction.user
                },
                volume: 80,
                leaveOnEmpty: mode247 === true ? false : true,
                leaveOnEnd: mode247 === true ? false : true
            });
        }

        try {
            if (!queue.connection) await queue.connect(voiceChannel);
        } catch (err) {
            return interaction.reply({ content: `❌ Voice connect error: \`${err.message}\``, ephemeral: true });
        }

        // Agar 24/7 option select kiya hai
        if (mode247 !== null) {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return interaction.reply({ content: '❌ 24/7 mode configure karne ke liye `Manage Server` permission chahiye.', ephemeral: true });
            }

            if (mode247 === true) {
                await Music247.findOneAndUpdate(
                    { guildId: interaction.guildId },
                    { voiceChannelId: voiceChannel.id, textChannelId: interaction.channelId, enabled: true },
                    { upsert: true }
                );

                queue.node.setLeaveOnEmpty(false);
                queue.node.setLeaveOnEnd(false);

                return interaction.reply(`🔒 **24/7 Mode Enabled!** Bot ab <#${voiceChannel.id}> me permanently rahega.`);
            } else {
                await Music247.findOneAndUpdate(
                    { guildId: interaction.guildId },
                    { enabled: false }
                );

                queue.node.setLeaveOnEmpty(true);
                queue.node.setLeaveOnEnd(true);

                return interaction.reply('🔓 **24/7 Mode Disabled!** Bot normal auto-leave behavior par wapas aa gaya hai.');
            }
        }

        return interaction.reply(`🔊 Connected to <#${voiceChannel.id}>.`);
    }
};
