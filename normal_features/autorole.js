const { PermissionFlagsBits } = require('discord.js');
const { isNormalFeatureEnabled } = require('../utils/featureCheck');

module.exports = (client) => {
    // 1. One-Click Setup
    client.on('messageCreate', async (message) => {
        if (!message.guild || message.author.bot) return;

        const args = message.content.trim().split(/ +/);
        if (args[0]?.toLowerCase() !== '!set-autorole') return;

        if (message.guild && !(await isNormalFeatureEnabled(message.guild.id))) return;
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return message.reply('❌ Manage Roles permission required.');
        }

        const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[1]);
        if (!role) {
            return message.reply('❌ Usage: `!set-autorole @Role`');
        }

        if (role.position >= message.guild.members.me.roles.highest.position) {
            return message.reply('❌ My role must be placed higher than that role.');
        }

        try {
            await message.channel.setTopic(`spark_autorole_${role.id}`);
            return message.reply(`✅ **Auto-Role Set!** New members will automatically receive **${role.name}**.`);
        } catch (err) {
            return message.reply(`❌ Failed to bind auto-role: \`${err.message}\``);
        }
    });

    // 2. Member Assign
    client.on('guildMemberAdd', async (member) => {
        if (member.user.bot || !member.guild) return;
        if (!(await isNormalFeatureEnabled(member.guild.id))) return;

        const configChannel = member.guild.channels.cache.find(c => 
            c.topic && c.topic.includes('spark_autorole_')
        );
        if (!configChannel) return;

        const match = configChannel.topic.match(/spark_autorole_(\d+)/);
        if (!match) return;

        const targetRoleId = match[1];
        const role = member.guild.roles.cache.get(targetRoleId);
        if (role) {
            await member.roles.add(role).catch(() => {});
        }
    });
};
