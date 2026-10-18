const ServerSettings = require('../models/serverSettings');

// Premium Features (handlers/ folder ke individual modules)
async function isFeatureEnabled(guildId, featureName) {
    if (!guildId) return false;
    
    const settings = await ServerSettings.findOne({ guildId });
    if (!settings || !settings.features) return false; // Default me premium features disabled
    
    return Boolean(settings.features[featureName]);
}

// Normal Features (normal_features/ folder ke sare modules ke liye master check)
async function isNormalFeatureEnabled(guildId) {
    if (!guildId) return true;
    
    const settings = await ServerSettings.findOne({ guildId });
    if (!settings) return true; // Default me normal features enabled
    
    return settings.normalFeatures ?? true;
}

module.exports = { 
    isFeatureEnabled, 
    isNormalFeatureEnabled 
};
