const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    panelChannelId: { type: String, default: null },
    supportRoleId: { type: String, default: null },
    panelDescription: { 
        type: String, 
        default: '✦ SUPPORT CENTER ✦\n\nNeed help? Create a ticket and our staff will assist you.\n\n◆ General Support\n◆ Reports\n◆ Purchase\n◆ Partnership\n\n» Please select the correct category.\n» Do not create unnecessary tickets.' 
    },
    ticketMessage: { 
        type: String, 
        default: '✦ Your ticket has been created!\n\n◆ Please explain your issue clearly.\n◆ Provide any required details or proof.\n◆ Please wait patiently for a staff member to assist you.\n\n» Thank you for contacting support!' 
    },
    bannerUrl: { type: String, default: '' },
    categories: { 
        type: String, 
        default: '🎟️ General Support, 🚨 Reports, 💳 Purchase, 🤝 Partnership' 
    },
    ticketCounter: { type: Number, default: 0 }
});

module.exports = mongoose.model('TicketConfig', ticketSchema);
