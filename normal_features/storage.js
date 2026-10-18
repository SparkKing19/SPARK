const fs = require('node:fs');
const path = require('node:path');
const dir = path.join(__dirname, 'data');
const file = path.join(dir, 'normal_features.json');
fs.mkdirSync(dir, { recursive: true });
function read() { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } }
const data = read();
function save() { const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(data, null, 2)); fs.renameSync(tmp, file); }
function guild(id) { data[id] ||= { welcomeChannel: null, ticketCategory: null, ticketLog: null, staffRole: null, leveling: true, xp: {} }; return data[id]; }
module.exports = { guild, save };
