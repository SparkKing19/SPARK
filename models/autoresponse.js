const mongoose = require('mongoose');

const autoresponseSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    responses: [{
        trigger: String,
        response: String
    }],
    rawConfig: { type: String, default: '' }
});

module.exports = mongoose.model('AutoResponseConfig', autoresponseSchema);
