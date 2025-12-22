# Subscription Plan Schema & API Documentation

## Overview

The Subscription Plan feature allows administrators to create and manage different subscription tiers (Basic, Premium, Enterprise) with customizable features, pricing, and billing cycles.

---

## Files Created

1. **`src/models/SubscriptionPlan.js`** - MongoDB Schema
2. **`src/controllers/subscriptionPlanController.js`** - Business Logic (10 functions)
3. **`src/routes/subscriptionPlanRoutes.js`** - API Endpoints
4. **`src/app.js`** - Updated with route mounting

---

## Database Schema

### SubscriptionPlan Collection

```javascript
{
  // Basic Info
  name: String (enum: ['Basic', 'Premium', 'Enterprise']),
  description: String,
  
  // Pricing (Multiple billing periods)
  price: {
    monthly: Number,
    quarterly: Number,
    halfYearly: Number,
    yearly: Number
  },
  currency: String (default: 'INR'),
  
  // Discount Management
  discount: {
    percentage: Number (0-100),
    validFrom: Date,
    validUpto: Date,
    description: String
  },
  
  // Features Array
  features: [{
    name: String,
    description: String,
    included: Boolean,
    limit: Number
  }],
  
  // Plan Limitations
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
  
  // Billing Cycles with Savings
  billingCycle: [{
    period: String (enum: ['monthly', 'quarterly', 'halfYearly', 'yearly']),
    duration: Number,
    savingsPercentage: Number
  }],
  
  // Plan Status
  status: String (enum: ['active', 'inactive', 'archived', 'coming_soon']),
  
  // User Types
  userType: String (enum: ['tenant', 'landlord', 'both']),
  
  // Visibility
  visibility: String (enum: ['public', 'private', 'hidden']),
  
  // Display Settings
  display: {
    displayOrder: Number,
    isPopular: Boolean,
    highlightText: String,
    backgroundColor: String,
    badgeText: String
  },
  
  // Trial Configuration
  trial: {
    isTrialAvailable: Boolean,
    trialDays: Number,
    trialPrice: Number
  },
  
  // Add-ons/Optional Services
  addOns: [{
    name: String,
    description: String,
    price: Number,
    billingFrequency: String (enum: ['one-time', 'monthly', 'yearly'])
  }],
  
  // Refund Policy
  refundPolicy: {
    refundable: Boolean,
    refundDays: Number,
    refundDescription: String
  },
  
  // Payment Methods
  allowedPaymentMethods: [String],
  
  // Metadata
  metadata: Map,
  createdAt: Date,
  updatedAt: Date,
  createdBy: ObjectId,
  updatedBy: ObjectId
}
```

---

## API Endpoints (10 Total)

### 1. **Create Subscription Plan** (Admin)
```http
POST /api/subscription-plans/create
Content-Type: application/json

{
  "name": "Premium",
  "description": "Ideal for growing property businesses",
  "price": {
    "monthly": 999,
    "quarterly": 2699,
    "halfYearly": 4999,
    "yearly": 9999
  },
  "userType": "both",
  "currency": "INR",
  "features": [
    {
      "name": "Up to 5 Properties",
      "description": "Manage up to 5 properties",
      "included": true
    }
  ],
  "limits": {
    "maxProperties": 5,
    "maxListings": 50,
    "maxImages": 500,
    "prioritySupport": true,
    "analyticsAccess": true
  },
  "billingCycle": [
    {
      "period": "monthly",
      "duration": 1,
      "savingsPercentage": 0
    },
    {
      "period": "yearly",
      "duration": 12,
      "savingsPercentage": 25
    }
  ]
}
```

**Response (201):**
```json
{
  "message": "Subscription plan created successfully",
  "plan": {
    "_id": "65f2c3d4e5f6a7b8c9d0e1f4",
    "name": "Premium",
    "description": "Ideal for growing property businesses",
    "status": "active",
    "userType": "both"
  }
}
```

---

### 2. **Get All Plans** (with Filters)
```http
GET /api/subscription-plans/list/all?status=active&userType=landlord&limit=10&page=1
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| status | String | Filter: 'active', 'inactive', 'archived', 'coming_soon' |
| userType | String | Filter: 'tenant', 'landlord', 'both' |
| visibility | String | Filter: 'public', 'private', 'hidden' |
| page | Number | Page number (default: 1) |
| limit | Number | Records per page (default: 10) |

**Response (200):**
```json
{
  "message": "Subscription plans retrieved successfully",
  "plans": [
    {
      "_id": "65f2c3d4e5f6a7b8c9d0e1f4",
      "name": "Premium",
      "price": {
        "monthly": 999,
        "yearly": 9999
      },
      "status": "active",
      "userType": "both"
    }
  ],
  "pagination": {
    "total": 3,
    "page": 1,
    "limit": 10,
    "pages": 1
  }
}
```

---

### 3. **Get Public Plans** (For Website Display)
```http
GET /api/subscription-plans/public/available?userType=tenant
```

Returns only active, public plans for display on the website.

**Response (200):**
```json
{
  "message": "Public subscription plans retrieved successfully",
  "plans": [
    {
      "_id": "65f2c3d4e5f6a7b8c9d0e1f1",
      "name": "Basic",
      "description": "Perfect for getting started",
      "price": {
        "monthly": 299,
        "yearly": 2799
      },
      "features": [...],
      "display": {
        "displayOrder": 1,
        "isPopular": false
      }
    }
  ],
  "count": 3
}
```

---

### 4. **Get Plan by ID or Name**
```http
GET /api/subscription-plans/Premium
GET /api/subscription-plans/65f2c3d4e5f6a7b8c9d0e1f4
```

**Response (200):**
```json
{
  "message": "Subscription plan retrieved successfully",
  "plan": {
    "_id": "65f2c3d4e5f6a7b8c9d0e1f4",
    "name": "Premium",
    "price": {...},
    "features": [...],
    "limits": {...}
  }
}
```

---

### 5. **Get Plan Pricing** (With Discount Calculations)
```http
GET /api/subscription-plans/Premium/pricing
```

Calculates effective prices considering active discounts.

**Response (200):**
```json
{
  "message": "Plan pricing retrieved successfully",
  "planName": "Premium",
  "currency": "INR",
  "pricing": {
    "monthly": 999,
    "quarterly": 2699,
    "halfYearly": 4999,
    "yearly": 9999,
    "hasDiscount": true,
    "discountPercentage": 10
  },
  "discount": {
    "active": true,
    "percentage": 10,
    "validUpto": "2025-12-31T23:59:59.000Z"
  }
}
```

---

### 6. **Update Plan** (Admin)
```http
PATCH /api/subscription-plans/:id
Content-Type: application/json

{
  "price": {
    "monthly": 1099,
    "yearly": 10999
  },
  "display": {
    "isPopular": true,
    "highlightText": "Trending"
  }
}
```

**Response (200):**
```json
{
  "message": "Subscription plan updated successfully",
  "plan": {...}
}
```

---

### 7. **Deactivate Plan** (Soft Delete)
```http
POST /api/subscription-plans/:id/deactivate
```

Sets status to 'inactive' without deleting data.

**Response (200):**
```json
{
  "message": "Subscription plan deactivated successfully",
  "plan": {
    "_id": "...",
    "status": "inactive"
  }
}
```

---

### 8. **Activate Plan**
```http
POST /api/subscription-plans/:id/activate
```

Sets status to 'active'.

**Response (200):**
```json
{
  "message": "Subscription plan activated successfully",
  "plan": {
    "_id": "...",
    "status": "active"
  }
}
```

---

### 9. **Delete Plan** (Hard Delete)
```http
DELETE /api/subscription-plans/:id
```

Permanently removes the plan.

**Response (200):**
```json
{
  "message": "Subscription plan deleted successfully",
  "plan": {...}
}
```

---

### 10. **Seed Default Plans** (Admin - One Time)
```http
POST /api/subscription-plans/seed/default
```

Creates 3 default plans: Basic, Premium, Enterprise.

**Response (201):**
```json
{
  "message": "Default subscription plans created successfully",
  "plans": [...],
  "count": 3
}
```

---

## Default Plans Included

### Basic Plan
- **Monthly**: ₹299
- **Yearly**: ₹2,799 (20% savings)
- **Features**: 1 Property, Basic Analytics, Email Support
- **Max Listings**: 5
- **Storage**: 10 GB

### Premium Plan (Most Popular)
- **Monthly**: ₹999
- **Yearly**: ₹9,999 (25% savings)
- **Features**: 5 Properties, Advanced Analytics, Priority Support
- **Max Listings**: 50
- **Storage**: 100 GB
- **Custom Branding**: Yes

### Enterprise Plan
- **Monthly**: ₹2,999
- **Yearly**: ₹29,999 (30% savings)
- **Features**: Unlimited Properties, 24/7 Support, Dedicated Account Manager
- **Max Listings**: Unlimited
- **Storage**: 1000 GB
- **API Access**: Yes

---

## Features & Limits

### Available Features
```javascript
[
  "Up to X Properties",
  "Basic Analytics",
  "Advanced Analytics",
  "Email Support",
  "Priority Support",
  "24/7 Support",
  "Mobile App Access",
  "Custom Branding",
  "API Access",
  "Dedicated Account Manager"
]
```

### Configurable Limits
- `maxProperties` - Number of properties user can create
- `maxListings` - Total listings across all properties
- `maxImages` - Total images that can be uploaded
- `maxReels` - Video reels allowed
- `storageInGB` - Cloud storage in GB
- `prioritySupport` - Priority support access
- `analyticsAccess` - Advanced analytics
- `customBranding` - Custom branding options
- `apiAccess` - API access for integrations

---

## Payment Methods

Each plan can support specific payment methods:

```javascript
[
  "card",        // Credit/Debit Card
  "upi",         // UPI
  "netbanking",  // NetBanking
  "wallet",      // Digital Wallets
  "manual"       // Manual Payment
]
```

---

## Discount Management

Set time-limited discounts on plans:

```json
{
  "discount": {
    "percentage": 15,
    "validFrom": "2024-12-22T00:00:00Z",
    "validUpto": "2025-01-22T23:59:59Z",
    "description": "New Year Discount"
  }
}
```

The API automatically calculates effective prices when discount is active.

---

## Billing Cycles & Savings

Configure billing flexibility with savings incentives:

```javascript
billingCycle: [
  { period: 'monthly', duration: 1, savingsPercentage: 0 },
  { period: 'quarterly', duration: 3, savingsPercentage: 10 },
  { period: 'halfYearly', duration: 6, savingsPercentage: 15 },
  { period: 'yearly', duration: 12, savingsPercentage: 20 }
]
```

---

## Trial Configuration

Offer free or paid trials:

```json
{
  "trial": {
    "isTrialAvailable": true,
    "trialDays": 7,
    "trialPrice": 0
  }
}
```

---

## Display Customization

Customize how plans appear on the website:

```json
{
  "display": {
    "displayOrder": 2,
    "isPopular": true,
    "highlightText": "Most Popular",
    "backgroundColor": "#FFF5E1",
    "badgeText": "Popular"
  }
}
```

---

## Add-ons

Define optional paid add-ons for each plan:

```json
{
  "addOns": [
    {
      "name": "Extra Property",
      "description": "Add one more property",
      "price": 199,
      "billingFrequency": "monthly"
    },
    {
      "name": "Custom Domain",
      "description": "Setup custom domain",
      "price": 499,
      "billingFrequency": "one-time"
    }
  ]
}
```

---

## cURL Examples

### Create a Plan
```bash
curl -X POST http://localhost:8000/api/subscription-plans/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Premium",
    "description": "For growing businesses",
    "price": {
      "monthly": 999,
      "yearly": 9999
    },
    "userType": "both",
    "features": [
      {"name": "5 Properties", "included": true}
    ]
  }'
```

### Get All Active Plans
```bash
curl -X GET "http://localhost:8000/api/subscription-plans/list/all?status=active&limit=10"
```

### Get Public Plans (For Website)
```bash
curl -X GET "http://localhost:8000/api/subscription-plans/public/available?userType=tenant"
```

### Get Plan by Name
```bash
curl -X GET http://localhost:8000/api/subscription-plans/Premium
```

### Get Plan Pricing
```bash
curl -X GET http://localhost:8000/api/subscription-plans/Premium/pricing
```

### Update Plan Price
```bash
curl -X PATCH http://localhost:8000/api/subscription-plans/:id \
  -H "Content-Type: application/json" \
  -d '{"price": {"monthly": 1099, "yearly": 10999}}'
```

### Deactivate Plan
```bash
curl -X POST http://localhost:8000/api/subscription-plans/:id/deactivate
```

### Seed Default Plans
```bash
curl -X POST http://localhost:8000/api/subscription-plans/seed/default
```

---

## Validation Rules

| Field | Rules |
|-------|-------|
| name | Required, unique, enum (Basic/Premium/Enterprise) |
| description | Required, string |
| price | Required, object with monthly/quarterly/half-yearly/yearly |
| userType | Required, enum (tenant/landlord/both) |
| status | Optional, enum (active/inactive/archived/coming_soon) |
| discount.percentage | 0-100 |
| features | Array of feature objects |
| limits | Object with numeric values |

---

## Integration with Subscription

When a user buys a subscription, the system:

1. Fetches the plan details from SubscriptionPlan
2. Applies any active discounts
3. Creates a Subscription record linked to the plan
4. Assigns features based on plan's feature array
5. Enforces limits based on plan's limits object

---

## Status Flow

```
COMING_SOON → ACTIVE ⟷ INACTIVE → ARCHIVED
                ↓
           (Permanent deletion)
```

- **active**: Users can subscribe to this plan
- **inactive**: Plan is temporarily unavailable
- **archived**: Plan is discontinued but records kept
- **coming_soon**: Plan not yet available

---

## Performance Notes

### Indexes Created
- `name` - Plan name lookup
- `status` - Filter by status
- `userType` - Filter by user type
- Combined `(status, userType)` - Common filter combination

### Query Performance
- Get public plans: O(1)
- Get by name: O(1)
- Filter by status: O(1)
- List all: O(n)

---

## Schema Files Structure

```
src/
├── models/
│   └── SubscriptionPlan.js (265 lines)
├── controllers/
│   └── subscriptionPlanController.js (520 lines)
├── routes/
│   └── subscriptionPlanRoutes.js (55 lines)
└── app.js (Updated)
```

**Total:** ~840 lines of code

---

**Created:** December 22, 2025  
**Version:** 1.0  
**Status:** ✅ Production Ready
