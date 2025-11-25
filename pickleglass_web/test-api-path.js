const fs = require('fs');
const path = require('path');

// Simulate the exact API logic
const userId = 'abdullahfullstackdev7@gmail.com';
const cancelledFile = path.join(process.cwd(), 'cancelled-subscriptions.json');

console.log('Testing API path logic...');
console.log('Current working directory:', process.cwd());
console.log('Cancelled file path:', cancelledFile);

// Simulate the Stripe fallback path (which is what the API is using)
let mockData = {
  subscriptionId: `sub_mock_${userId}`,
  status: 'active',
  customerId: `cus_mock_${userId}`,
  currentPeriodStart: Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60),
  currentPeriodEnd: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60),
  nextBillingDate: Date.now() + (30 * 24 * 60 * 60 * 1000),
  cancelAt: null,
  canceledAt: null,
  planId: 'price_pro_monthly',
  amount: 1000,
  currency: 'usd',
  interval: 'month',
  path: 'stripe_fallback'
};

console.log('Initial mock data:', mockData);

// Check if this subscription was cancelled
try {
  console.log('Checking for cancelled subscription:', mockData.subscriptionId);
  if (fs.existsSync(cancelledFile)) {
    const data = fs.readFileSync(cancelledFile, 'utf8');
    const cancelledSubscriptions = JSON.parse(data);
    console.log('Cancelled subscriptions keys:', Object.keys(cancelledSubscriptions));
    const cancelledSub = cancelledSubscriptions[mockData.subscriptionId];
    
    if (cancelledSub) {
      console.log('Found cancelled subscription:', cancelledSub);
      mockData.status = 'cancelled';
      mockData.cancelAt = cancelledSub.cancelAt;
      mockData.canceledAt = cancelledSub.cancelledAt;
      console.log('Updated mock data:', mockData);
    } else {
      console.log('No cancelled subscription found for:', mockData.subscriptionId);
    }
  } else {
    console.log('Cancelled subscriptions file does not exist');
  }
} catch (error) {
  console.error('Error reading cancelled subscriptions file:', error);
}

console.log('Final mock data:', mockData); 