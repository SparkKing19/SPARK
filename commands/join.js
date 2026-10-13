const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const Music247 = require('../models/music247');

// Helper function to safely get or create player with wait
async function getOrCreatePlayer(poru, guildId, voiceChannelId, textChannelId) {
    let player = poru.players.get(guildId);
    if (player) return player;

    for (let i = 0; i < 5; i++) {
        const hasNode = poru.leastUsedNodes.some(n => n.isConnected);
        if (hasNode) {
            try {
                return poru.createConnection({
                    guildId,
                    voiceChannel: voiceChannelId,
                    textChannel: textChannelId,
                    deaf: true
                });
            } catch (e) {}
        }
        await new Promise(res => setTimeout(res, 800));
    }
    return null;
}

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
            return interaction.editReply('❌ Music engine connect ho raha hai, please dobara try karein.');
        }

        const player = await getOrCreatePlayer(poru, interaction.guildId, voiceChannel.id, interaction.channelId);
        if (!player) {
            return interaction.editReply('⚠️ Audio server reconnect ho raha hai, kripya 5 second baad dobara try karein.');
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
