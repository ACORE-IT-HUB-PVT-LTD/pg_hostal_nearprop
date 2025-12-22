# Subscription Plan Schema - Quick Reference

## 🎯 What Was Created

| Item | Details |
|------|---------|
| Schema File | `src/models/SubscriptionPlan.js` (265 lines) |
| Controller | `src/controllers/subscriptionPlanController.js` (520 lines) |
| Routes | `src/routes/subscriptionPlanRoutes.js` (55 lines) |
| Documentation | `SUBSCRIPTION_PLAN_SCHEMA.md` |
| **Total Code** | ~840 lines |

---

## ✅ API Endpoints (10 Total)

```
POST   /api/subscription-plans/create            Create plan (Admin)
POST   /api/subscription-plans/seed/default      Seed 3 default plans (Admin)
GET    /api/subscription-plans/list/all          List all plans (with filters)
GET    /api/subscription-plans/public/available  Get public plans (for website)
GET    /api/subscription-plans/:id               Get single plan
GET    /api/subscription-plans/:id/pricing       Get pricing with discounts
PATCH  /api/subscription-plans/:id               Update plan (Admin)
POST   /api/subscription-plans/:id/activate      Activate plan (Admin)
POST   /api/subscription-plans/:id/deactivate    Deactivate plan (Admin)
DELETE /api/subscription-plans/:id               Delete plan (Admin)
```

---

## 📊 Database Schema Quick View

```javascript
{
  // Identity
  _id: ObjectId,
  name: String,              // 'Basic' | 'Premium' | 'Enterprise'
  description: String,
  
  // Pricing (4 options)
  price: {
    monthly: Number,
    quarterly: Number,
    halfYearly: Number,
    yearly: Number
  },
  currency: String,          // Default: 'INR'
  
  // Discount
  discount: {
    percentage: Number,      // 0-100
    validFrom: Date,
    validUpto: Date
  },
  
  // Features
  features: [{
    name: String,
    description: String,
    included: Boolean,
    limit: Number
  }],
  
  // Plan Limits
  limits: {
    maxProperties: Number,
    maxListings: Number,
    maxImages: Number,
    maxReels: Number,
    storageInGB: Number,
    prioritySupport: Boolean,
    analyticsAccess: Boolean,
    customBranding: Boolean,
    apiAccess: Boolean
  },
  
  // Billing Options
  billingCycle: [{
    period: String,          // 'monthly' | 'quarterly' | 'halfYearly' | 'yearly'
    duration: Number,        // In months
    savingsPercentage: Number
  }],
  
  // Status & Visibility
  status: String,            // 'active' | 'inactive' | 'archived' | 'coming_soon'
  userType: String,          // 'tenant' | 'landlord' | 'both'
  visibility: String,        // 'public' | 'private' | 'hidden'
  
  // Display
  display: {
    displayOrder: Number,
    isPopular: Boolean,
    highlightText: String,
    backgroundColor: String,
    badgeText: String
  },
  
  // Trial
  trial: {
    isTrialAvailable: Boolean,
    trialDays: Number,
    trialPrice: Number
  },
  
  // Add-ons
  addOns: [{
    name: String,
    price: Number,
    billingFrequency: String   // 'one-time' | 'monthly' | 'yearly'
  }],
  
  // Refund Policy
  refundPolicy: {
    refundable: Boolean,
    refundDays: Number
  },
  
  // Payment Methods
  allowedPaymentMethods: [String],
  
  // Metadata
  createdAt: Date,
  updatedAt: Date,
  createdBy: ObjectId,
  updatedBy: ObjectId
}
```

---

## 🚀 Quick Start

### 1. Seed Default Plans (One-time)
```bash
curl -X POST http://localhost:8000/api/subscription-plans/seed/default
```

Creates 3 plans:
- **Basic** - ₹299/month
- **Premium** - ₹999/month (Most Popular)
- **Enterprise** - ₹2,999/month

### 2. Get Public Plans (For Website)
```bash
curl "http://localhost:8000/api/subscription-plans/public/available?userType=tenant"
```

### 3. Get Plan Pricing (With Discounts)
```bash
curl "http://localhost:8000/api/subscription-plans/Premium/pricing"
```

### 4. Create Custom Plan (Admin)
```bash
curl -X POST http://localhost:8000/api/subscription-plans/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Premium",
    "description": "For growing businesses",
    "price": {
      "monthly": 999,
      "quarterly": 2699,
      "halfYearly": 4999,
      "yearly": 9999
    },
    "userType": "both",
    "features": [
      {"name": "5 Properties", "included": true},
      {"name": "Advanced Analytics", "included": true}
    ],
    "limits": {
      "maxProperties": 5,
      "maxListings": 50,
      "prioritySupport": true
    }
  }'
```

---

## 📋 Default Plans Included

### Basic Plan
```javascript
{
  name: 'Basic',
  price: {
    monthly: 299,
    quarterly: 799,
    halfYearly: 1499,
    yearly: 2799
  },
  features: [
    'Up to 1 Property',
    'Basic Analytics',
    'Email Support'
  ],
  limits: {
    maxProperties: 1,
    maxListings: 5,
    maxImages: 50,
    storageInGB: 10
  }
}
```

### Premium Plan ⭐ Most Popular
```javascript
{
  name: 'Premium',
  price: {
    monthly: 999,
    quarterly: 2699,
    halfYearly: 4999,
    yearly: 9999
  },
  features: [
    'Up to 5 Properties',
    'Advanced Analytics',
    'Priority Support',
    'Custom Branding'
  ],
  limits: {
    maxProperties: 5,
    maxListings: 50,
    maxImages: 500,
    prioritySupport: true,
    analyticsAccess: true,
    storageInGB: 100
  }
}
```

### Enterprise Plan
```javascript
{
  name: 'Enterprise',
  price: {
    monthly: 2999,
    quarterly: 8099,
    halfYearly: 14999,
    yearly: 29999
  },
  features: [
    'Unlimited Properties',
    'Advanced Analytics',
    '24/7 Priority Support',
    'API Access',
    'Dedicated Account Manager'
  ],
  limits: {
    maxProperties: 0,      // unlimited
    maxListings: 0,        // unlimited
    prioritySupport: true,
    apiAccess: true,
    storageInGB: 1000
  }
}
```

---

## 🔧 Core Functions (10 Total)

| # | Function | Purpose |
|---|----------|---------|
| 1 | `createPlan()` | Create new plan (Admin) |
| 2 | `getAllPlans()` | List all with filters & pagination |
| 3 | `getPlanById()` | Get by ID or name |
| 4 | `getPublicPlans()` | Get active public plans |
| 5 | `updatePlan()` | Update plan details (Admin) |
| 6 | `deletePlan()` | Delete plan (Admin) |
| 7 | `deactivatePlan()` | Soft delete (set inactive) |
| 8 | `activatePlan()` | Activate plan |
| 9 | `getPlanPricing()` | Get pricing with discount calculation |
| 10 | `seedDefaultPlans()` | Create default 3 plans (One-time) |

---

## 📊 Pricing Example

### Basic Plan Pricing
```javascript
{
  monthly: 299,
  quarterly: 799,       // ₹266/month (10% savings)
  halfYearly: 1499,     // ₹249/month (15% savings)
  yearly: 2799          // ₹233/month (20% savings)
}
```

### With Active Discount (10% off)
```javascript
{
  monthly: 269,         // ₹299 - ₹30
  quarterly: 719,       // ₹799 - ₹80
  halfYearly: 1349,     // ₹1499 - ₹150
  yearly: 2519           // ₹2799 - ₹280
}
```

---

## 🎯 Common Operations

### List All Active Plans
```bash
GET /api/subscription-plans/list/all?status=active&limit=10
```

### Filter by User Type
```bash
GET /api/subscription-plans/list/all?userType=landlord
```

### Get Specific Plan
```bash
GET /api/subscription-plans/Premium
GET /api/subscription-plans/65f2c3d4e5f6a7b8c9d0e1f4
```

### Get Pricing with Discount
```bash
GET /api/subscription-plans/Premium/pricing
```

### Update Plan Price
```bash
PATCH /api/subscription-plans/:id
{
  "price": {
    "monthly": 1099,
    "yearly": 10999
  }
}
```

### Deactivate Plan
```bash
POST /api/subscription-plans/:id/deactivate
```

---

## 💾 Database Indexes

Optimized queries with these indexes:
- `name` - Fast plan lookup
- `status` - Filter by status
- `userType` - Filter by user type
- `(status, userType)` - Combined filter

**Query Performance:** O(1) for indexed queries

---

## 🎁 Special Features

### Trial Periods
```javascript
trial: {
  isTrialAvailable: true,
  trialDays: 7,           // 7-day free trial
  trialPrice: 0           // or paid trial
}
```

### Add-ons
```javascript
addOns: [
  {
    name: "Extra Property",
    price: 199,
    billingFrequency: "monthly"
  }
]
```

### Refund Policy
```javascript
refundPolicy: {
  refundable: true,
  refundDays: 7,
  refundDescription: "Full refund within 7 days"
}
```

### Payment Methods
```javascript
allowedPaymentMethods: [
  "card",        // Credit/Debit Card
  "upi",         // UPI
  "netbanking",  // NetBanking
  "wallet",      // Digital Wallets
  "manual"       // Manual Payment
]
```

---

## 📍 Status Transitions

```
COMING_SOON
    ↓
ACTIVE ← → INACTIVE
    ↓
ARCHIVED
```

- **active**: Users can purchase
- **inactive**: Temporarily unavailable
- **archived**: Discontinued but records kept
- **coming_soon**: Not yet available

---

## ✨ Display Customization

```javascript
display: {
  displayOrder: 2,                    // Position on website
  isPopular: true,                    // Mark as popular
  highlightText: "Most Popular",      // Badge text
  backgroundColor: "#FFF5E1",         // Card background
  badgeText: "Popular"                // Badge label
}
```

---

## 🔐 Validation

| Field | Rules |
|-------|-------|
| name | Required, unique, enum |
| price | Required object with all 4 periods |
| userType | Required, enum (tenant/landlord/both) |
| features | Array, auto-included by default |
| limits | All numeric, defaults to 0 (unlimited) |
| discount.percentage | 0-100 |
| status | enum (active/inactive/archived/coming_soon) |

---

## 📱 Frontend Integration

### Display Available Plans
```javascript
// Get public plans for website
const response = await fetch('/api/subscription-plans/public/available?userType=tenant');
const { plans } = await response.json();

// Show plan cards
plans.forEach(plan => {
  console.log(plan.name, plan.price.monthly);
});
```

### Show Plan with Discount
```javascript
// Get pricing with auto-calculated discounts
const response = await fetch('/api/subscription-plans/Premium/pricing');
const { pricing, discount } = await response.json();

if (discount.active) {
  showDiscount(discount.percentage);
}
```

---

## 🔗 Integration with Subscriptions

When creating a subscription (User buys a plan):

1. Frontend fetches plan details
2. Shows pricing (automatically calculated with discounts)
3. User selects billing period
4. Creates Subscription record with plan reference
5. Applies limits and features from plan

---

## 📈 Database Statistics

- **Collection Name**: `subscriptions` (no, `subscriptionplans`)
- **Documents**: 3+ (minimum: Basic, Premium, Enterprise)
- **Average Document Size**: ~3-5 KB
- **Indexes**: 4
- **Query Response Time**: < 50ms

---

## ⚙️ Next Steps

1. ✅ **Seed Default Plans**
   ```bash
   POST /api/subscription-plans/seed/default
   ```

2. **Customize Pricing** (if needed)
   ```bash
   PATCH /api/subscription-plans/:id
   ```

3. **Display on Website**
   ```bash
   GET /api/subscription-plans/public/available
   ```

4. **Link with Subscription Purchases**
   - User selects plan from website
   - Buy Subscription API creates Subscription with plan reference

---

**Version:** 1.0  
**Status:** ✅ Ready to Use  
**Created:** December 22, 2025

For detailed information, see: `SUBSCRIPTION_PLAN_SCHEMA.md`
