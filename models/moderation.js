const mongoose = require('mongoose');

const moderationSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    staffRoleIds: { type: [String], default: [] },
    linkAllowRoleIds: { type: [String], default: [] },
    ipAllowRoleIds: { type: [String], default: [] },
    ignoredChannelIds: { type: [String], default: [] },
    modLogsChannelId: { type: String, default: null },
    rawConfig: { type: String, default: '' }
});

module.exports = mongoose.model('ModerationConfig', moderationSchema);
