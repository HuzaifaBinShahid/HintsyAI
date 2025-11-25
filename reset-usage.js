// Quick script to reset usage for testing using Electron store

const Store = require('electron-store');

console.log('🔄 Resetting usage count...');

// Create the same store instance as the usage tracking service
const store = new Store({ name: 'usage-tracking' });

const currentDate = new Date();
const currentMonth = currentDate.getFullYear() + '-' + (currentDate.getMonth() + 1);

// Reset usage data
const usageData = {
    monthlyRequests: 0,
    lastResetDate: currentDate.toISOString(),
    currentMonth: currentMonth
};

store.set('usageTracking', usageData);
store.set('currentPlan', 'free');

console.log('✅ Usage reset in Electron store!');
console.log('📊 New status: 0/15 requests used');

console.log('\n🚀 Restart the Electron app - you can now make requests again for testing!');