const ServerSettings = require('../models/serverSettings');

async function isFeatureEnabled(guildId, featureName) {
    if (!guildId) return true;
    
    const settings = await ServerSettings.findOne({ guildId });
    if (!settings || !settings.features) return true; // By default enabled
    
    // Check if the specific module is enabled or disabled
    return Boolean(settings.features[featureName]);
}

module.exports = { isFeatureEnabled };
