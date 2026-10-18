const { guild, save } = require('./storage');
const PREFIX='!';
module.exports = client => {
  client.on('messageCreate', async msg => {
    if(!msg.guild || msg.author.bot) return;
    const cfg=guild(msg.guild.id); const id=msg.author.id;
    if(cfg.leveling) {
      cfg.xp[id] ||= { messages:0, level:0 }; const user=cfg.xp[id]; user.messages++;
      const next=Math.floor(user.messages/25);
      if(next>user.level){user.level=next; await msg.channel.send(`✦ ${msg.author} reached **Level ${user.level}**!`);}
      if(user.messages%5===0) save();
    }
    const match=msg.content.trim().match(/^!leveling\s+(on|off)$/i);
    if(match){if(!msg.member.permissions.has('ManageGuild')) return msg.reply('You need Manage Server permission.'); cfg.leveling=match[1].toLowerCase()==='on'; save(); return msg.reply(`Leveling is now **${cfg.leveling?'enabled':'disabled'}**.`);}
    if(/^!rank(?:\s+<@!?\d+>)?$/i.test(msg.content.trim())) {const idMatch=msg.content.match(/<@!?(\d+)>/); const target=idMatch?.[1]||msg.author.id; const d=cfg.xp[target]||{messages:0,level:0}; return msg.reply(`**${target===msg.author.id?'Your':`<@${target}>'s`} rank**\nLevel: **${d.level}**\nMessages: **${d.messages}**\nNext level: **${25-(d.messages%25)} messages**`);}
  });
};
