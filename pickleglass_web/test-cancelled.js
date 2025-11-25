const fs = require('fs');
const path = require('path');

const cancelledFile = path.join(process.cwd(), 'cancelled-subscriptions.json');
const subscriptionId = 'sub_mock_abdullahfullstackdev7@gmail.com';

console.log('Testing cancelled subscriptions file reading...');
console.log('File path:', cancelledFile);
console.log('Looking for subscription ID:', subscriptionId);

if (fs.existsSync(cancelledFile)) {
  const data = fs.readFileSync(cancelledFile, 'utf8');
  const cancelledSubscriptions = JSON.parse(data);
  console.log('Cancelled subscriptions keys:', Object.keys(cancelledSubscriptions));
  
  const cancelledSub = cancelledSubscriptions[subscriptionId];
  if (cancelledSub) {
    console.log('Found cancelled subscription:', cancelledSub);
  } else {
    console.log('No cancelled subscription found for:', subscriptionId);
  }
} else {
  console.log('Cancelled subscriptions file does not exist');
} 