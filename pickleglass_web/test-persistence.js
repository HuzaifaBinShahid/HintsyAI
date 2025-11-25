const fs = require('fs');
const path = require('path');

// Simulate the subscription details API logic
const userId = 'abdullahfullstackdev7@gmail.com';
const cancelledFile = path.join(process.cwd(), 'cancelled-subscriptions.json');

console.log('Testing subscription persistence logic...');
console.log('User ID:', userId);

let mockSubscriptionData = {
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
  interval: 'month'
};

console.log('Initial subscription data:', mockSubscriptionData);

// Check if this subscription was cancelled
try {
  console.log('Checking for cancelled subscription:', mockSubscriptionData.subscriptionId);
  if (fs.existsSync(cancelledFile)) {
    const data = fs.readFileSync(cancelledFile, 'utf8');
    const cancelledSubscriptions = JSON.parse(data);
    console.log('Cancelled subscriptions keys:', Object.keys(cancelledSubscriptions));
    const cancelledSub = cancelledSubscriptions[mockSubscriptionData.subscriptionId];
    
    if (cancelledSub) {
      console.log('Found cancelled subscription:', cancelledSub);
      mockSubscriptionData.status = 'cancelled';
      mockSubscriptionData.cancelAt = cancelledSub.cancelAt;
      mockSubscriptionData.canceledAt = cancelledSub.cancelledAt;
      console.log('Updated subscription data:', mockSubscriptionData);
    } else {
      console.log('No cancelled subscription found for:', mockSubscriptionData.subscriptionId);
    }
  } else {
    console.log('Cancelled subscriptions file does not exist');
  }
} catch (error) {
  console.error('Error reading cancelled subscriptions file:', error);
}

console.log('Final subscription data:', mockSubscriptionData); 