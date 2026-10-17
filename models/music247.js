const mongoose = require('mongoose');

const music247Schema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    voiceChannelId: { type: String, default: null },
    textChannelId: { type: String, default: null },
    enabled: { type: Boolean, default: false }
});

module.exports = mongoose.model('Music247', music247Schema);
