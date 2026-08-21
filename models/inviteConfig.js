const mongoose = require('mongoose');

const inviteConfigSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    inviteChannelId: { type: String, default: null },
    logsChannelId: { type: String, default: null }
});

module.exports = mongoose.model('InviteConfig', inviteConfigSchema);
