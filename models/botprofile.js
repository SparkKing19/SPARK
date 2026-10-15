const mongoose = require('mongoose');

const botProfileSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    nickname: { type: String, default: null },
    avatarUrl: { type: String, default: null },
    bannerColor: { type: String, default: '#5865F2' }
});

module.exports = mongoose.model('BotProfileConfig', botProfileSchema);
