const { ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { guild, save } = require('./storage');
const staffPerms=[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.ManageChannels];
module.exports = client => {
  client.on('messageCreate', async msg => {
    if(!msg.guild || msg.author.bot) return;
    const cfg=guild(msg.guild.id), isAdmin=msg.member.permissions.has(PermissionFlagsBits.ManageGuild)||msg.member.permissions.has(PermissionFlagsBits.ManageChannels);
    if(/^!set-ticket$/i.test(msg.content.trim())) {
      if(!isAdmin) return msg.reply('You need Manage Server or Manage Channels permission.');
      try {
        let role=msg.guild.roles.cache.find(r=>r.name==='Ticket Support'); if(!role) role=await msg.guild.roles.create({name:'Ticket Support',reason:'Normal ticket system staff role'});
        let category=cfg.ticketCategory&&msg.guild.channels.cache.get(cfg.ticketCategory);
        if(!category) category=await msg.guild.channels.create({name:'Tickets',type:ChannelType.GuildCategory,permissionOverwrites:[{id:msg.guild.id,deny:[PermissionFlagsBits.ViewChannel]},{id:role.id,allow:staffPerms}]});
        let log=cfg.ticketLog&&msg.guild.channels.cache.get(cfg.ticketLog);
        if(!log) log=await msg.guild.channels.create({name:'ticket-logs',type:ChannelType.GuildText,permissionOverwrites:[{id:msg.guild.id,deny:[PermissionFlagsBits.ViewChannel]},{id:role.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]},{id:msg.guild.members.me.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]}]});
        Object.assign(cfg,{staffRole:role.id,ticketCategory:category.id,ticketLog:log.id}); save();
        const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('nf_ticket_open').setLabel('Create Ticket').setStyle(ButtonStyle.Primary).setEmoji('🎫'));
        await msg.channel.send({embeds:[new EmbedBuilder().setColor(0x5865F2).setTitle('Support Center').setDescription('Press the button below to open a private support ticket.')],components:[row]});
        return msg.reply(`Ticket system ready. Staff role: ${role}. Logs: ${log}. Assign trusted moderators to the role.`);
      } catch(e) { console.error('[normal_features/ticket setup]',e); return msg.reply('Ticket setup failed. Check Manage Channels and Manage Roles permissions.'); }
    }
    if(/^!ticket$/i.test(msg.content.trim())) return openTicket(msg);
    if(/^!close$/i.test(msg.content.trim())) {
      const topic=msg.channel.topic||''; const owner=topic.match(/ticket-owner:(\d+)/)?.[1];
      if(!owner) return;
      if(msg.author.id!==owner&&!isTicketStaff(msg.member,cfg)) return msg.reply('Only the ticket owner or Ticket Support staff can close this ticket.');
      return closeTicket(msg.channel,msg.member,cfg,client,msg.author.tag);
    }
  });
  client.on('interactionCreate', async i => {
    if(!i.isButton()||!i.guild) return;
    const cfg=guild(i.guild.id);
    try {
      if(i.customId==='nf_ticket_open') { await i.deferReply({ephemeral:true}); const channel=await makeTicket(i.guild,i.user,cfg); return i.editReply(`Your ticket is ready: ${channel}`); }
      if(i.customId.startsWith('nf_ticket_claim:')) { const id=i.customId.split(':')[1]; if(!isTicketStaff(i.member,cfg)) return i.reply({content:'Only Ticket Support staff can claim tickets.',ephemeral:true}); await i.channel.setTopic(`${i.channel.topic||''}`.replace(/\s*claimed-by:\d+/g,'').trim()+` claimed-by:${i.user.id}`); await i.reply({content:`Ticket claimed by ${i.user}.`}); await logAction(i.guild,cfg,`Ticket claimed: ${i.channel} by ${i.user}`); }
      if(i.customId.startsWith('nf_ticket_close:')) { const owner=i.channel.topic?.match(/ticket-owner:(\d+)/)?.[1]; if(i.user.id!==owner&&!isTicketStaff(i.member,cfg)) return i.reply({content:'Only the ticket owner or Ticket Support staff can close it.',ephemeral:true}); await i.reply({content:'Closing ticket…',ephemeral:true}); await closeTicket(i.channel,i.member,cfg,client,i.user.tag); }
    } catch(e) { console.error('[normal_features/ticket button]',e); if(!i.replied&&!i.deferred) await i.reply({content:'Ticket action failed. Check bot permissions.',ephemeral:true}).catch(()=>{}); }
  });
};
function isTicketStaff(member,cfg){return member.permissions.has(PermissionFlagsBits.ManageGuild)||member.permissions.has(PermissionFlagsBits.ManageChannels)||(cfg.staffRole&&member.roles.cache.has(cfg.staffRole));}
async function makeTicket(guild,user,cfg){const existing=guild.channels.cache.find(c=>c.type===ChannelType.GuildText&&c.topic?.includes(`ticket-owner:${user.id}`)); if(existing) return existing; if(!cfg.ticketCategory||!cfg.staffRole) throw new Error('Run !set-ticket first'); const channel=await guild.channels.create({name:`ticket-${user.username}`.toLowerCase().replace(/[^a-z0-9-]/g,'-').slice(0,90),type:ChannelType.GuildText,parent:cfg.ticketCategory,topic:`ticket-owner:${user.id}`,permissionOverwrites:[{id:guild.id,deny:[PermissionFlagsBits.ViewChannel]},{id:user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.AttachFiles,PermissionFlagsBits.EmbedLinks]},{id:cfg.staffRole,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.ManageMessages]},{id:guild.members.me.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.ManageChannels]}]}); const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`nf_ticket_claim:${user.id}`).setLabel('Claim').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`nf_ticket_close:${user.id}`).setLabel('Close').setStyle(ButtonStyle.Danger)); await channel.send({content:`Welcome ${user}. Describe your issue below.`,components:[row]}); await logAction(guild,cfg,`Ticket opened: ${channel} by ${user.tag}`); return channel;}
async function openTicket(msg){const cfg=guild(msg.guild.id); try{return msg.reply(`Your ticket is ready: ${await makeTicket(msg.guild,msg.author,cfg)}`);}catch{return msg.reply('Ticket system is not configured yet. Ask an administrator to run `!set-ticket`.');}}
async function closeTicket(channel,member,cfg,client,by){const guild=channel.guild; await logAction(guild,cfg,`Ticket closed: #${channel.name} by ${by}`); await channel.delete(`Ticket closed by ${by}`);}
async function logAction(guild,cfg,text){const log=cfg.ticketLog&&guild.channels.cache.get(cfg.ticketLog); if(log) await log.send({content:text}).catch(()=>{});}
