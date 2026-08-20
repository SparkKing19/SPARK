const mongoose = require('mongoose');

const ytnotifSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    ytChannelId: { type: String, default: null },
    discordChannelId: { type: String, default: null },
    customMessage: { 
        type: String, 
        default: '📢 **New Video Uploaded!**\n\n**{title}**\nWatch here: {url}' 
    },
    lastVideoId: { type: String, default: '' }
});

module.exports = mongoose.model('YTNotifConfig', ytnotifSchema);
