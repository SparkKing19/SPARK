const mongoose = require('mongoose');

const backupSchema = new mongoose.Schema({
    backupId: { type: String, required: true, unique: true },
    guildId: { type: String, required: true },
    creatorId: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    isAutoBackup: { type: Boolean, default: false },
    data: {
        name: String,
        icon: String,
        roles: Array,
        channels: Array
    }
});

module.exports = mongoose.model('ServerBackup', backupSchema);
