const mongoose = require('mongoose');

const giveawaySchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    channelId: { type: String, required: true },
    messageId: { type: String, required: true, unique: true },
    hostId: { type: String, required: true },
    reward: { type: String, required: true },
    winnerCount: { type: Number, default: 1 },
    endsAt: { type: Date, required: true },
    ended: { type: Boolean, default: false }
});

module.exports = mongoose.model('Giveaway', giveawaySchema);
