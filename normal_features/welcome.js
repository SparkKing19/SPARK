const { AttachmentBuilder, ChannelType } = require('discord.js');
const { guild, save } = require('./storage');
async function welcomeCard(member) {
  const { createCanvas, loadImage } = require('@napi-rs/canvas');
  const canvas = createCanvas(900, 420), c = canvas.getContext('2d');
  const bg = c.createLinearGradient(0, 0, 900, 420); bg.addColorStop(0, '#191b21'); bg.addColorStop(1, '#292c33'); c.fillStyle = bg; c.fillRect(0,0,900,420);
  c.fillStyle='#087fc5'; c.beginPath(); c.roundRect(20,45,18,280,9); c.fill(); c.fillStyle='#00bdc8'; c.beginPath(); c.roundRect(862,90,18,280,9); c.fill();
  c.fillStyle='#393c43'; c.beginPath(); c.roundRect(290,24,320,42,12); c.fill(); c.fillStyle='#fff'; c.textAlign='center'; c.font='bold 22px sans-serif'; c.fillText(`Member #${member.guild.memberCount}`,450,52);
  const avatar=await loadImage(member.user.displayAvatarURL({extension:'png',size:256})); c.save(); c.beginPath(); c.arc(450,160,77,0,Math.PI*2); c.clip(); c.drawImage(avatar,373,83,154,154); c.restore(); c.strokeStyle='#fff'; c.lineWidth=7; c.beginPath(); c.arc(450,160,78,0,Math.PI*2); c.stroke();
  c.fillStyle='#fff'; c.font='bold 36px sans-serif'; c.fillText('Welcome',450,282); let name=member.user.username; c.font='bold 30px sans-serif'; while(c.measureText(name).width>780&&name.length>8) name=name.slice(0,-2)+'…'; c.fillText(name,450,326); c.font='24px sans-serif'; c.fillStyle='#d9dce3'; c.fillText(`to ${member.guild.name}`.slice(0,55),450,370); return canvas.toBuffer('image/png');
}
module.exports = client => {
  client.on('guildMemberAdd', async member => {
    const cfg=guild(member.guild.id); if(!cfg.welcomeChannel) return;
    const channel=member.guild.channels.cache.get(cfg.welcomeChannel); if(!channel || channel.type!==ChannelType.GuildText) return;
    try { const buf=await welcomeCard(member); await channel.send({content:`Welcome ${member} to **${member.guild.name}**!`,files:[new AttachmentBuilder(buf,{name:'welcome.png'})]}); } catch(err) { console.error('[normal_features/welcome]',err); }
  });
  client.on('messageCreate', async msg => {
    if(!msg.guild || msg.author.bot || !msg.member.permissions.has('ManageGuild')) return;
    const m=msg.content.match(/^!set-welcome\s+(?:<#(\d+)>|(\d+))$/i); if(!m) return;
    const channel=msg.guild.channels.cache.get(m[1]||m[2]); if(!channel || channel.type!==ChannelType.GuildText) return msg.reply('Please mention a valid text channel.');
    guild(msg.guild.id).welcomeChannel=channel.id; save(); return msg.reply(`Welcome channel set to ${channel}.`);
  });
};
