// metro.config.js
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Wrap the default config and point it to your global CSS file
module.exports = withNativeWind(config, { input: "./global.css" });