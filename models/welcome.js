const mongoose = require('mongoose');

const welcomeSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    channelId: { type: String, default: null },
    title: { type: String, default: '✦ WELCOME TO {server} ✦' },
    description: { 
        type: String, 
        default: '✦ Welcome, {user}!\n\n◆ You are our {memberCount}th member.\n◆ Joined: {joined}\n\n» Explore the server\n» Meet new people\n» Stay active & have fun\n» Follow the rules\n\n✦ Thank you for joining {server}!\n◆ We hope you enjoy your stay.' 
    },
    bannerUrl: { type: String, default: '' },
    dmText: { type: String, default: 'Hey {user}, thank you for joining {server}!' }
});

module.exports = mongoose.model('WelcomeConfig', welcomeSchema);
