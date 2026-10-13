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
        try {
            await interaction.deferReply();
        } catch {
            return;
        }

        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
            return interaction.editReply('❌ Pehle kisi Voice Channel me join karein!');
        }

        const mode247 = interaction.options.getBoolean('mode_247');
        const poru = interaction.client.poru;

        if (!poru) {
            return interaction.editReply('❌ Music system abhi initialize ho raha hai, thodi der baad try karein.');
        }

        // Direct check: Any connected node in poru.nodes Map
        const isOnline = Array.from(poru.nodes.values()).some(n => n.isConnected);
        if (!isOnline) {
            return interaction.editReply('⚠️ Audio server reconnect ho raha hai, 5 second baad dobara try karein.');
        }

        let player = poru.players.get(interaction.guildId);
        if (!player) {
            try {
                player = poru.createConnection({
                    guildId: interaction.guildId,
                    voiceChannel: voiceChannel.id,
                    textChannel: interaction.channelId,
                    deaf: true
                });
            } catch (err) {
                return interaction.editReply(`❌ Voice connect error: \`${err.message}\``);
            }
        }

        if (mode247 !== null) {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return interaction.editReply('❌ 24/7 mode ke liye `Manage Server` permission chahiye.');
            }

            if (mode247 === true) {
                await Music247.findOneAndUpdate(
                    { guildId: interaction.guildId },
                    { voiceChannelId: voiceChannel.id, textChannelId: interaction.channelId, enabled: true },
                    { upsert: true }
                );
                return interaction.editReply(`🔒 **24/7 Mode Enabled!** Bot ab <#${voiceChannel.id}> me permanently rahega.`);
            } else {
                await Music247.findOneAndUpdate(
                    { guildId: interaction.guildId },
                    { enabled: false }
                );
                return interaction.editReply('🔓 **24/7 Mode Disabled!**');
            }
        }

        return interaction.editReply(`🔊 Connected to <#${voiceChannel.id}>.`);
    }
};
