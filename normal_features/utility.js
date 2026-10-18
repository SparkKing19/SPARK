const { EmbedBuilder } = require('discord.js');
module.exports = client => {
  client.on('messageCreate', async msg => {
    if(!msg.guild || msg.author.bot) return;
    const text=msg.content.trim();
    if(/^!normal-help$/i.test(text)) return msg.reply({embeds:[new EmbedBuilder().setColor(0x5865F2).setTitle('Normal Features').setDescription('`!set-welcome #channel` — set welcome channel (Manage Server)\n`!set-ticket` — create ticket category, staff role, logs and panel (Manage Channels/Server)\n`!ticket` — open a ticket\n`!close` — close current ticket\n`!rank [@member]` — view level\n`!leveling on/off` — toggle leveling (Manage Server)') ]});
    if(/^!botinfo$/i.test(text)) return msg.reply(`**${client.user.username}**\nServers: ${client.guilds.cache.size}\nUsers cached: ${client.users.cache.size}\nPing: ${client.ws.ping}ms`);
    if(/^!serverinfo$/i.test(text)) {const g=msg.guild; return msg.reply({embeds:[new EmbedBuilder().setColor(0x5865F2).setTitle(g.name).setThumbnail(g.iconURL()).addFields({name:'Members',value:String(g.memberCount),inline:true},{name:'Channels',value:String(g.channels.cache.size),inline:true},{name:'Created',value:`<t:${Math.floor(g.createdTimestamp/1000)}:D>`,inline:true})]});}
  });
};
