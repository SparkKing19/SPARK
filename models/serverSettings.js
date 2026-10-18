// models/serverSettings.js
const mongoose = require('mongoose');

const serverSettingsSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    mode: { type: String, enum: ['normal', 'premium'], default: 'normal' },
    normalFeatures: { type: Boolean, default: true }, // Normal features folder ke liye default ON
    features: {
        welcome: { type: Boolean, default: false },
        ticket: { type: Boolean, default: false },
        onboarding: { type: Boolean, default: false },
        stats: { type: Boolean, default: false },
        store: { type: Boolean, default: false },
        moderation: { type: Boolean, default: false },
        autoresponse: { type: Boolean, default: false },
        voicegen: { type: Boolean, default: false },
        apply: { type: Boolean, default: false },
        youtube: { type: Boolean, default: false },
        invite: { type: Boolean, default: false },
        goodbye: { type: Boolean, default: false },
        giveaway: { type: Boolean, default: false },
        music: { type: Boolean, default: false },
        leveling: { type: Boolean, default: false },
        botprofile: { type: Boolean, default: false },
        ai: { type: Boolean, default: false }
    }
}, { timestamps: true });

module.exports = mongoose.model('ServerSettings', serverSettingsSchema);
