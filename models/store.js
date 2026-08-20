const mongoose = require('mongoose');

const storeItemSchema = new mongoose.Schema({
    category: String,
    name: String,
    price: String
});

const storeCmdSchema = new mongoose.Schema({
    itemName: String,
    command: String
});

const pendingOrderSchema = new mongoose.Schema({
    orderNumber: String,
    userId: String,
    username: String,
    itemName: String,
    category: String,
    price: String,
    channelId: String,
    createdAt: { type: Date, default: Date.now },
    lastNotified: { type: Date, default: Date.now }
});

const storeSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    storeRoleId: { type: String, default: null },
    panelChannelId: { type: String, default: null },
    categoryId: { type: String, default: null },
    cmdsChannelId: { type: String, default: null },
    logsChannelId: { type: String, default: null },
    bannerUrl: { type: String, default: '' },
    panelDesc: { 
        type: String, 
        default: '✦ SERVER STORE ✦\n\nSelect a category from the dropdown below to explore available items.' 
    },
    orderDesc: { 
        type: String, 
        default: '✦ NEW ORDER RECEIVED ✦\n\n◆ **Category:** {category}\n◆ **Item:** {item}\n◆ **Price:** {price}\n◆ **IGN:** {username}\n◆ **Buyer:** {user}' 
    },
    approvedDm: { 
        type: String, 
        default: '✅ Hey {user}, your order for **{item}** has been APPROVED! Items delivered to `{username}`.' 
    },
    rejectedDm: { 
        type: String, 
        default: '❌ Hey {user}, your order for **{item}** was REJECTED by staff.' 
    },
    pendingDm: { 
        type: String, 
        default: '⏳ Hey {user}, your order for **{item}** (`{username}`) is currently under review by our staff team.' 
    },
    items: [storeItemSchema],
    commands: [storeCmdSchema],
    orderCounter: { type: Number, default: 0 },
    pendingOrders: [pendingOrderSchema],
    rawItems: { type: String, default: '' },
    rawIds: { type: String, default: '' },
    rawTexts: { type: String, default: '' },
    rawCmds: { type: String, default: '' }
});

module.exports = mongoose.model('StoreConfig', storeSchema);
