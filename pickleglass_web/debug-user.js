const fs = require('fs');
const path = require('path');

const upgradeFile = path.join(process.cwd(), 'user-upgrades.json');
let upgrades = {};

if (fs.existsSync(upgradeFile)) {
  const data = fs.readFileSync(upgradeFile, 'utf8');
  upgrades = JSON.parse(data);
  console.log('Current user-upgrades.json:');
  console.log(JSON.stringify(upgrades, null, 2));
} else {
  console.log('user-upgrades.json does not exist');
}
const userId = process.argv[2];
if (userId) {
  console.log(`\nAdding user ${userId} to user-upgrades.json with Pro plan...`);
  
  upgrades[userId] = {
    planId: 'pro',
    upgradeTime: new Date().toISOString(),
    sessionId: `cs_test_${Date.now()}`,
    email: `${userId}@example.com`
  };
  
  fs.writeFileSync(upgradeFile, JSON.stringify(upgrades, null, 2));
} 