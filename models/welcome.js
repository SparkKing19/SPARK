const mongoose = require('mongoose');

const welcomeSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    channelId: { type: String, default: null },
    title: { type: String, default: 'Welcome to {server}!' },
    description: { type: String, default: 'Hey {user}, welcome to {server}!\n\n📅 **Account Created:** {accountCreate}\n📥 **Joined Server:** {joined}\n👥 **Member Count:** #{memberCount}' },
    bannerUrl: { type: String, default: '' },
    dmText: { type: String, default: 'Hey {user}, thank you for joining {server}!' }
});

module.exports = mongoose.model('WelcomeConfig', welcomeSchema);
