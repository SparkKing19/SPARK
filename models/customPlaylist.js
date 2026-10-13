const mongoose = require('mongoose');

const customPlaylistSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    name: { type: String, required: true },
    tracks: [
        {
            title: String,
            uri: String,
            author: String,
            length: Number
        }
    ],
    recording: { type: Boolean, default: false }
});

module.exports = mongoose.model('CustomPlaylist', customPlaylistSchema);
