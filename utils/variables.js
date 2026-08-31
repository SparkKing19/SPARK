// Universal Variable Formatter
function parseVariables(text, member, guild) {
    if (!text) return '';
    const user = member?.user || member;
    const g = guild || member?.guild;

    const joinedTimestamp = member?.joinedTimestamp 
        ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>` 
        : 'N/A';
    const createdTimestamp = user?.createdTimestamp 
        ? `<t:${Math.floor(user.createdTimestamp / 1000)}:F>` 
        : 'N/A';

    return text
        .replace(/{user}/g, user ? `<@${user.id}>` : 'Unknown User')
        .replace(/{Joined}/g, joinedTimestamp)
        .replace(/{server}/g, g ? g.name : 'Unknown Server')
        .replace(/{accountCreated}/g, createdTimestamp)
        .replace(/{username}/g, user ? user.username : 'Unknown')
        .replace(/{members}/g, g ? `${g.memberCount}` : '0');
}

module.exports = { parseVariables };
