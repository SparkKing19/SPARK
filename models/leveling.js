const mongoose = require('mongoose');

// User Level Progress Schema
const userLevelSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    userId: { type: String, required: true },
    level: { type: Number, default: 0 },
    messages: { type: Number, default: 0 },
    totalMessages: { type: Number, default: 0 }
});

userLevelSchema.index({ guildId: 1, userId: 1 }, { unique: true });

// Server Settings / Config Schema (Panel aur setup ke liye)
const levelConfigSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    baseStep: { type: Number, default: 25 },
    channelId: { type: String, default: null },
    messageTemplate: { type: String, default: 'Congratulations {user}! You leveled up to **Level {level}**!' }
});

const UserLevel = mongoose.models.UserLevel || mongoose.model('UserLevel', userLevelSchema);
const LevelConfig = mongoose.models.LevelConfig || mongoose.model('LevelConfig', levelConfigSchema);

// Backward compatibility: Direct import par UserLevel milega aur destructure par dono milenge
UserLevel.UserLevel = UserLevel;
UserLevel.LevelConfig = LevelConfig;

module.exports = UserLevel;
