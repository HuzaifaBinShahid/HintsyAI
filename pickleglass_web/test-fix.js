const fs = require('fs');
const path = require('path');

// Simulate the exact API logic with the fix
const userId = 'abdullahfullstackdev7@gmail.com';
const cancelledFile = path.join(process.cwd(), 'cancelled-subscriptions.json');

console.log('Testing the fix for cancelled subscription persistence...');
console.log('User ID:', userId);
console.log('Cancelled file path:', cancelledFile);

// Simulate the Stripe fallback path (which is what the API uses)
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
  interval: 'month'
};

console.log('Initial mock data:', mockData);

// Check if this subscription was cancelled (with the fix)
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
      console.log('✅ SUCCESS: Updated mock data to cancelled status');
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

if (mockData.status === 'cancelled') {
  console.log('🎉 SUCCESS: The fix is working! Subscription shows as cancelled.');
} else {
  console.log('❌ FAILED: Subscription still shows as active.');
} 