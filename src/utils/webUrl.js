const { app } = require('electron');

/**
 * Utility to get the dynamic web URL from environment variables
 * Falls back to localhost:3000 for development
 */
function getWebUrl() {
  // return process.env.Hintsy_AI_URL || 'http://localhost:3000';
  return app.isPackaged ? 'https://hintsy-steel.vercel.app' : 'http://localhost:3000';
}

module.exports = { getWebUrl };
