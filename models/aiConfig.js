const mongoose = require('mongoose');

const aiConfigSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    channelId: { type: String, default: null },
    enabled: { type: Boolean, default: true }
});

module.exports = mongoose.model('AIConfig', aiConfigSchema);
