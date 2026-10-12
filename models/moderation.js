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
    
    // AutoMod Filters (Links & Media default allowed, IPs & Domains default blocked)
    blockLinks: { type: Boolean, default: false },
    blockMedia: { type: Boolean, default: false },
    blockIps: { type: Boolean, default: true },
    blockDomains: { type: Boolean, default: true },
    blockUrls: { type: Boolean, default: true },
    badWords: { type: [String], default: [] },
    channelOverrides: {
        type: Map,
        of: new mongoose.Schema({
            allowLinks: { type: Boolean, default: false },
            allowMedia: { type: Boolean, default: false },
            allowIps: { type: Boolean, default: false },
            denyLinks: { type: Boolean, default: false },
            denyMedia: { type: Boolean, default: false },
            denyIps: { type: Boolean, default: false }
        }, { _id: false }),
        default: {}
    }
});

module.exports = mongoose.model('ModerationConfig', moderationSchema);
