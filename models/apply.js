const mongoose = require('mongoose');

const applySchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    panelChannelId: { type: String, default: null },
    reviewChannelId: { type: String, default: null },
    questions: { type: [String], default: [] },
    rawQuestions: { type: String, default: '' },
    activeSessions: [{
        userId: String,
        channelId: String,
        step: { type: Number, default: 0 },
        answers: [String],
        createdAt: { type: Date, default: Date.now }
    }]
});

module.exports = mongoose.model('ApplyConfig', applySchema);
