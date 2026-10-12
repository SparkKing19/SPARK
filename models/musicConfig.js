const mongoose = require('mongoose');

const musicConfigSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    alwaysChannelId: { type: String, default: null },
    isAlwaysOn: { type: Boolean, default: false }
});

module.exports = mongoose.model('MusicConfig', musicConfigSchema);
