const mongoose = require('mongoose');

const onboardingOptionSchema = new mongoose.Schema({
    emoji: { type: String, default: null },
    label: { type: String, required: true },
    roleId: { type: String, required: true }
});

const onboardingStepSchema = new mongoose.Schema({
    emoji: { type: String, default: '⭐' },
    title: { type: String, required: true },
    question: { type: String, required: true },
    isMultiple: { type: Boolean, default: false },
    channelId: { type: String, default: null },
    options: [onboardingOptionSchema]
});

const onboardingSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    rawConfig: { type: String, default: '' },
    rawChannels: { type: String, default: '' },
    steps: [onboardingStepSchema]
});

module.exports = mongoose.model('OnboardingConfig', onboardingSchema);
