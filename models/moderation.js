const mongoose = require('mongoose');

const moderationSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    antiNukeEnabled: { type: Boolean, default: true },
    extraOwners: { type: [String], default: [] },
    whitelistedUsers: { type: [String], default: [] },
    whitelistedBots: { type: [String], default: [] },
    userModPerms: { 
        type: Map, 
        of: [String], 
        default: {} 
    },
    staffRoleIds: { type: [String], default: [] },
    ignoredChannelIds: { type: [String], default: [] },
    modLogsChannelId: { type: String, default: null },
    
    // AutoMod Filters
    blockLinks: { type: Boolean, default: true },
    blockMedia: { type: Boolean, default: false },
    blockIps: { type: Boolean, default: true },
    blockDomains: { type: Boolean, default: true },
    blockUrls: { type: Boolean, default: true },
    badWords: { type: [String], default: [] },
    channelOverrides: {
        type: Map,
        of: new mongoose.Schema({
            allowLinks: Boolean,
            allowMedia: Boolean,
            allowIps: Boolean
        }, { _id: false }),
        default: {}
    }
});

module.exports = mongoose.model('ModerationConfig', moderationSchema);
