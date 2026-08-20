const mongoose = require('mongoose');

const onboardingStepSchema = new mongoose.Schema({
    emoji: { type: String, default: '⭐' },
    title: { type: String, default: 'Role Setup' },
    question: { type: String, default: 'Click the button below to get this role!' },
    roleId: { type: String, default: null },
    channelId: { type: String, default: null }
});

const onboardingSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    rawConfig: { type: String, default: '' },
    rawChannels: { type: String, default: '' },
    steps: [onboardingStepSchema]
});

module.exports = mongoose.model('OnboardingConfig', onboardingSchema);
