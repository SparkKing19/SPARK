const mongoose = require('mongoose');

const statsSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    channelId: { type: String, default: null },
    channelFormat: { 
        type: String, 
        default: '‧˚₊⊹👤Total Members {count}/{goal}' 
    },
    memberGoal: { type: Number, default: 100 },
    dmText: { 
        type: String, 
        default: '🎉 Goal Achieved! {server} ne successfully {goal} members complete kar liye hain!' 
    },
    goalReached: { type: Boolean, default: false }
});

module.exports = mongoose.model('StatsConfig', statsSchema);
