const mongoose = require('mongoose');

// User Level Schema
const userLevelSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    userId: { type: String, required: true },
    level: { type: Number, default: 0 },
    messages: { type: Number, default: 0 },
    totalMessages: { type: Number, default: 0 }
});

userLevelSchema.index({ guildId: 1, userId: 1 }, { unique: true });

// Server Config Schema
const levelConfigSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    baseStep: { type: Number, default: 25 },
    channelId: { type: String, default: null },
    messageTemplate: { type: String, default: 'Congratulations {user}! You leveled up to **Level {level}**!' }
});

module.exports = {
    UserLevel: mongoose.model('UserLevel', userLevelSchema),
    LevelConfig: mongoose.model('LevelConfig', levelConfigSchema)
};
