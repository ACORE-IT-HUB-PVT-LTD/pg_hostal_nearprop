# Subscription Feature - Quick Reference

## 🎯 What Was Created

| File | Type | Purpose |
|------|------|---------|
| `src/models/Subscription.js` | Model | MongoDB schema for subscriptions |
| `src/controllers/subscriptionController.js` | Controller | Business logic (8 functions) |
| `src/routes/subscriptionRoutes.js` | Routes | API endpoints |
| `src/app.js` | Config | Route mounting |
| `SUBSCRIPTION_API.md` | Docs | Complete API documentation |
| `SUBSCRIPTION_IMPLEMENTATION.md` | Docs | Implementation summary |
| `SUBSCRIPTION_TESTING.md` | Docs | Test cases & examples |
| `SUBSCRIPTION_ARCHITECTURE.md` | Docs | Visual architecture |

---

## 🚀 Quick Start

### 1. Buy a Subscription
```bash
curl -X POST http://localhost:8000/api/subscription/buy \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "YOUR_USER_ID",
    "userType": "tenant",
    "planName": "Premium",
    "amount": 999,
    "duration": 12,
    "durationType": "months"
  }'
```

### 2. Check Status
```bash
curl http://localhost:8000/api/subscription/status/YOUR_USER_ID
```

### 3. Renew Subscription
```bash
curl -X POST http://localhost:8000/api/subscription/renew/SUBSCRIPTION_ID \
  -H "Content-Type: application/json" \
  -d '{"duration": 12, "durationType": "months"}'
```

---

## 📊 Key Fields

### Required for Purchase
- `userId` - Tenant or Landlord ObjectId
- `userType` - 'tenant' or 'landlord'
- `amount` - Price (number)
- `duration` - Duration value (positive number)

### Auto-Calculated
- `startDate` - Current date/time
- `endDate` - startDate + duration
- `expiryDate` - Same as endDate
- `createdAt` - Timestamp
- `updatedAt` - Timestamp

### Optional
- `planName` - 'Basic', 'Premium', 'Enterprise' (default: Basic)
- `durationType` - 'days', 'months', 'years' (default: months)
- `paymentMethod` - Payment type (default: card)
- `paymentId` - Payment gateway ID
- `transactionId` - Transaction reference
- `autoRenew` - Auto-renew flag (default: true)
- `isFreeTrial` - Trial flag (default: false)
- `features` - Array of features

---

## ✅ 8 API Functions

### 1. buySubscription()
Purchase new subscription for a user
```
POST /api/subscription/buy
```

### 2. getSubscriptionByUserId()
Get user's subscription details
```
GET /api/subscription/:userId
```

### 3. getAllSubscriptions()
List all subscriptions with filters & pagination
```
GET /api/subscription/list/all?status=active&limit=10
```

### 4. renewSubscription()
Extend subscription expiry
```
POST /api/subscription/renew/:id
```

### 5. cancelSubscription()
Cancel a subscription
```
POST /api/subscription/cancel/:id
```

### 6. checkSubscriptionStatus()
Check if subscription is active with days remaining
```
GET /api/subscription/status/:userId
```

### 7. updateSubscription()
Admin: Update subscription details
```
PATCH /api/subscription/:id
```

### 8. deleteSubscription()
Admin: Delete subscription
```
DELETE /api/subscription/:id
```

---

## 📈 Status Workflow

```
PURCHASED (pending payment)
    ↓
ACTIVE (payment completed)
    ├─→ RENEW → ACTIVE
    ├─→ EXPIRED (endDate passed)
    └─→ CANCELLED (user cancels)
```

---

## 🔍 Query Examples

### Get all active tenant subscriptions
```bash
GET /api/subscription/list/all?status=active&userType=tenant&limit=20
```

### Find expiring subscriptions
```bash
# Get subscription details and check expiryDate field
GET /api/subscription/:userId
# Response includes daysRemaining
```

### Filter by plan
```bash
GET /api/subscription/list/all?planName=Premium
```

### Paginate results
```bash
GET /api/subscription/list/all?page=2&limit=50
```

---

## 💾 Database Schema Quick View

```javascript
{
  // User Link
  userId: ObjectId,              // ref: Tenant or Landlord
  userType: String,              // 'tenant' | 'landlord'
  
  // Plan Details
  planName: String,              // 'Basic' | 'Premium' | 'Enterprise'
  amount: Number,                // Price
  duration: Number,              // Duration value
  durationType: String,          // 'days' | 'months' | 'years'
  
  // Status
  status: String,                // 'active' | 'inactive' | 'expired' | 'cancelled'
  paymentStatus: String,         // 'pending' | 'completed' | 'failed'
  
  // Dates
  startDate: Date,
  endDate: Date,
  expiryDate: Date,
  
  // Payment
  paymentMethod: String,
  paymentId: String,
  transactionId: String,
  paymentDate: Date,
  
  // Metadata
  features: [String],
  autoRenew: Boolean,
  renewalCount: Number,
  isFreeTrial: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

---

## 🛠️ Common Operations

### Check if user can access premium features
```javascript
const response = await fetch('/api/subscription/status/{userId}');
const data = await response.json();
if (data.isActive) {
  // Grant premium access
  // Check data.subscription.features for specific features
}
```

### Admin: Update subscription plan
```javascript
await fetch(`/api/subscription/${subscriptionId}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    amount: 1299,
    features: ['newFeature1', 'newFeature2']
  })
});
```

### Automatically renew on expiry
```javascript
// For user: autoRenew: true
// Subscription will remain active as long as they want
// If they don't renew payment, mark as 'inactive'
```

---

## 🔐 Validation Rules

| Field | Rules |
|-------|-------|
| userId | Required, valid ObjectId, user must exist |
| userType | Required, 'tenant' \| 'landlord' \| 'admin' |
| amount | Required, > 0 |
| duration | Required, > 0 |
| planName | Optional, 'Basic' \| 'Premium' \| 'Enterprise' |
| status | 'active' \| 'inactive' \| 'expired' \| 'cancelled' \| 'suspended' |
| paymentStatus | 'pending' \| 'completed' \| 'failed' \| 'refunded' |

---

## 📍 Error Codes

| Code | Message | Cause |
|------|---------|-------|
| 400 | User ID required | Missing userId |
| 400 | Valid user type required | Invalid userType |
| 400 | Valid amount required | Missing or invalid amount |
| 400 | User already has active subscription | Duplicate subscription |
| 404 | Tenant/Landlord not found | User doesn't exist |
| 404 | No subscription found | Subscription doesn't exist |
| 500 | Error purchasing subscription | Server error |

---

## 🎨 Frontend Integration Points

### Show subscription status
```javascript
// Check if user is subscribed
const sub = await fetch('/api/subscription/:userId').then(r => r.json());
if (sub.subscription) {
  showSubscriptionBadge(sub.subscription.planName);
  showRenewalDate(sub.subscription.expiryDate);
}
```

### Display subscription details
```javascript
// Get full subscription info
const { subscription } = await fetch('/api/subscription/:userId').then(r => r.json());
displayPlanName(subscription.planName);
displayFeatures(subscription.features);
displayExpiryDate(subscription.expiryDate);
```

### Manage subscription
```javascript
// Cancel or renew
await fetch('/api/subscription/cancel/{id}', {
  method: 'POST',
  body: JSON.stringify({ cancellationReason: 'Reason' })
});
```

---

## 📚 Documentation Files

| File | Content |
|------|---------|
| `SUBSCRIPTION_API.md` | Full API reference with all endpoints |
| `SUBSCRIPTION_IMPLEMENTATION.md` | What was created & implementation details |
| `SUBSCRIPTION_TESTING.md` | Test cases & cURL examples |
| `SUBSCRIPTION_ARCHITECTURE.md` | Visual diagrams & architecture |
| `SUBSCRIPTION_QUICK_REF.md` | This file - quick reference |

---

## 🔄 Integration Checklist

- [ ] Verify MongoDB connection
- [ ] Test buy subscription endpoint
- [ ] Test get subscription endpoint
- [ ] Test status check endpoint
- [ ] Test renewal endpoint
- [ ] Test cancel endpoint
- [ ] Add authentication middleware (optional)
- [ ] Add payment gateway integration
- [ ] Set up expiry notifications
- [ ] Create admin dashboard for subscriptions
- [ ] Add subscription features validation
- [ ] Set up cron for auto-renewal
- [ ] Add webhook handlers for payment updates

---

## 🎯 Next Steps

1. **Test Locally**
   - Run server: `npm start`
   - Test endpoints using cURL or Postman
   - Verify MongoDB data is created

2. **Integration**
   - Add payment gateway callbacks
   - Implement feature access control
   - Add notification system

3. **Admin Features**
   - Create subscription dashboard
   - Add manual override capabilities
   - Implement refund system

4. **Monitoring**
   - Track subscription metrics
   - Monitor expiring subscriptions
   - Alert on payment failures

---

## 📞 Support

For detailed information, refer to:
- **API Endpoints**: See `SUBSCRIPTION_API.md`
- **Testing**: See `SUBSCRIPTION_TESTING.md`
- **Architecture**: See `SUBSCRIPTION_ARCHITECTURE.md`
- **Full Implementation**: See `SUBSCRIPTION_IMPLEMENTATION.md`

---

**Version:** 1.0  
**Created:** December 22, 2025  
**Status:** ✅ Ready to Use
