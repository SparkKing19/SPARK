const mongoose = require('mongoose');

const backupSchema = new mongoose.Schema({
    backupId: { type: String, required: true, unique: true },
    guildId: { type: String, required: true },
    creatorId: { type: String, required: true },
    type: { 
        type: String, 
        enum: ['BOT_OWNER', 'SERVER_OWNER', 'AUTO_BOT_ADD'], 
        required: true 
    },
    data: {
        name: String,
        icon: String,
        roles: Array,
        channels: Array
    },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null } // TTL Index ke liye
});

// TTL Index: Jab expiresAt ka time reach hoga, MongoDB automatically document delete kar dega
backupSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('ServerBackup', backupSchema);
