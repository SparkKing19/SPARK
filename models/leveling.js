const mongoose = require('mongoose');

const levelingSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    messagesPerLevel: { type: Number, default: 25 },
    channelId: { type: String, default: null },
    levelUpMessage: { 
        type: String, 
        default: 'Congratulations {user}! You leveled up to **Level {level}**!' 
    },
    users: [{
        userId: String,
        messages: { type: Number, default: 0 },
        level: { type: Number, default: 0 }
    }]
});

module.exports = mongoose.model('LevelingConfig', levelingSchema);
