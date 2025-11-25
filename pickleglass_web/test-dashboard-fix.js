const fs = require('fs');
const path = require('path');

// Simulate the dashboard user ID logic
const user = {
  uid: 'Not loaded', // This is what the user has
  email: 'abdullahfullstackdev7@gmail.com'
};

// Use the same logic as the billing page
const userId = user?.uid && user.uid !== 'Not loaded' ? user.uid : user?.email;

console.log('Testing dashboard user ID logic...');
console.log('User object:', user);
console.log('Calculated userId:', userId);

// Check if this user has a pro plan in user-upgrades.json
const upgradeFile = path.join(process.cwd(), 'user-upgrades.json');
if (fs.existsSync(upgradeFile)) {
  const data = fs.readFileSync(upgradeFile, 'utf8');
  const upgrades = JSON.parse(data);
  
  console.log('\nChecking user-upgrades.json for userId:', userId);
  console.log('Available keys:', Object.keys(upgrades));
  
  const userUpgrade = upgrades[userId];
  if (userUpgrade) {
    console.log('✅ Found user upgrade:', userUpgrade);
    console.log('Plan:', userUpgrade.planId);
  } else {
    console.log('❌ No upgrade found for userId:', userId);
    
    // Check if any key matches the email
    const emailKey = Object.keys(upgrades).find(key => upgrades[key].email === user.email);
    if (emailKey) {
      console.log('✅ Found upgrade by email:', upgrades[emailKey]);
    } else {
      console.log('❌ No upgrade found by email either');
    }
  }
} else {
  console.log('user-upgrades.json does not exist');
}

console.log('\nExpected result: Dashboard should show Pro plan for this user'); 