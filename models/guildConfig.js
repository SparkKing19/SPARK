const mongoose = require('mongoose');

const guildConfigSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    panelChannelId: { type: String, default: null },
    panelMessageId: { type: String, default: null },
    extraOwners: { type: [String], default: [] },
    prefix: { type: String, default: '%' }
});

module.exports = mongoose.model('GuildConfig', guildConfigSchema);
