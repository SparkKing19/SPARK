// utils/variables.js
function parseVariables(text, context = {}) {
    if (!text || typeof text !== 'string') return '';

    const member = context.member || null;
    const user = context.user || member?.user || null;
    const guild = context.guild || member?.guild || null;
    const inviter = context.inviter || null;
    const target = context.target || null;
    const moderator = context.moderator || null;
    const reason = context.reason || 'No reason provided';

    const joinedTimestamp = member?.joinedTimestamp 
        ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>` 
        : 'N/A';
    const createdTimestamp = user?.createdTimestamp 
        ? `<t:${Math.floor(user.createdTimestamp / 1000)}:F>` 
        : 'N/A';

    return text
        .replace(/{user}/g, user ? `<@${user.id}>` : '{user}')
        .replace(/{username}/g, user ? user.username : 'Unknown')
        .replace(/{userTag}/g, user ? user.tag : 'Unknown#0000')
        .replace(/{userId}/g, user ? user.id : 'N/A')
        .replace(/{server}/g, guild ? guild.name : '{server}')
        .replace(/{serverIcon}/g, guild?.iconURL() || '')
        .replace(/{members}/g, guild ? `${guild.memberCount}` : '0')
        .replace(/{Joined}/g, joinedTimestamp)
        .replace(/{accountCreated}/g, createdTimestamp)
        .replace(/{inviter}/g, inviter ? `<@${inviter.id}>` : 'Unknown')
        .replace(/{inviterTag}/g, inviter ? inviter.tag : 'Unknown#0000')
        .replace(/{target}/g, target ? `<@${target.id}>` : '{target}')
        .replace(/{moderator}/g, moderator ? `<@${moderator.id}>` : '{moderator}')
        .replace(/{reason}/g, reason);
}

module.exports = { parseVariables };
