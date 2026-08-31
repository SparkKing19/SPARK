const mongoose = require('mongoose');

const goodbyeSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    channelId: { type: String, default: null },
    message: { 
        type: String, 
        default: 'Goodbye {user}, we will miss you! The server now has {members} members.' 
    },
    embedColor: { type: String, default: '#ED4245' },
    imageUrl: { type: String, default: null }
});

module.exports = mongoose.model('GoodbyeConfig', goodbyeSchema);
