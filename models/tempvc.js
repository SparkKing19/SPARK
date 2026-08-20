const mongoose = require('mongoose');

const tempvcSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    hubVoiceChannelId: { type: String, default: null },
    targetCategoryId: { type: String, default: null },
    activeChannels: [{
        channelId: String,
        ownerId: String
    }]
});

module.exports = mongoose.model('TempVCConfig', tempvcSchema);
