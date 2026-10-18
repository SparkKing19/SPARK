const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ChannelType, 
    PermissionFlagsBits 
} = require('discord.js');
const { isNormalFeatureEnabled } = require('../utils/featureCheck');

module.exports = (client) => {
    // 1. One-Click Setup
    client.on('messageCreate', async (message) => {
        if (!message.guild || message.author.bot) return;
        if (message.content.trim().toLowerCase() !== '!set-ticket') return;

        if (message.guild && !(await isNormalFeatureEnabled(message.guild.id))) return;
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('❌ Administrator permission required.');
        }

        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('🎫 Server Support & Assistance')
            .setDescription('Need help, have an inquiry, or want to report an issue?\nClick the button below to generate a private support ticket.')
            .setFooter({ text: 'Spark Support System' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('normal_open_ticket')
                .setLabel('Create Ticket')
                .setEmoji('📩')
                .setStyle(ButtonStyle.Primary)
        );

        await message.delete().catch(() => {});
        return message.channel.send({ embeds: [embed], components: [row] });
    });

    // 2. Ticket Actions
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isButton() || !interaction.guild) return;
        if (!(await isNormalFeatureEnabled(interaction.guildId))) return;

        // Open Ticket
        if (interaction.customId === 'normal_open_ticket') {
            const existing = interaction.guild.channels.cache.find(c => 
                c.topic === `spark_ticket_${interaction.user.id}`
            );
            if (existing) {
                return interaction.reply({ content: `❌ You already have an open ticket in <#${existing.id}>.`, ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });

            const ticketChannel = await interaction.guild.channels.create({
                name: `ticket-${interaction.user.username.toLowerCase()}`,
                type: ChannelType.GuildText,
                topic: `spark_ticket_${interaction.user.id}`,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { 
                        id: interaction.user.id, 
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] 
                    },
                    { 
                        id: interaction.guild.members.me.id, 
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] 
                    }
                ]
            });

            const ticketEmbed = new EmbedBuilder()
                .setColor('#2ECC71')
                .setTitle(`Ticket: ${interaction.user.username}`)
                .setDescription('Support staff will assist you shortly.\nClick below when you are ready to terminate this ticket.');

            const closeRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('normal_close_ticket')
                    .setLabel('Close Ticket')
                    .setEmoji('🔒')
                    .setStyle(ButtonStyle.Danger)
            );

            await ticketChannel.send({ 
                content: `<@${interaction.user.id}> Welcome to your ticket.`, 
                embeds: [ticketEmbed], 
                components: [closeRow] 
            });

            return interaction.editReply(`✅ Ticket created: <#${ticketChannel.id}>`);
        }

        // Close Ticket
        if (interaction.customId === 'normal_close_ticket') {
            await interaction.reply('🔒 Closing this ticket in 5 seconds...');
            setTimeout(() => {
                interaction.channel.delete().catch(() => {});
            }, 5000);
        }
    });
};
