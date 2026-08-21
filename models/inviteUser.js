const mongoose = require('mongoose');

const inviteUserSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    userId: { type: String, required: true },
    regular: { type: Number, default: 0 },
    left: { type: Number, default: 0 },
    rejoined: { type: Number, default: 0 },
    invitedMembers: [{
        memberId: String,
        status: { type: String, enum: ['joined', 'left', 'rejoined'], default: 'joined' }
    }]
});

inviteUserSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('InviteUser', inviteUserSchema);
