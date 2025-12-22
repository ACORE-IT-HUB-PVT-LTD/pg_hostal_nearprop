# Subscription API Documentation

## Overview
The Subscription API provides functionality to manage user subscriptions for tenants and landlords. It includes features for purchasing, renewing, and managing subscription plans.

## Files Created

### 1. **Subscription Model** - `/src/models/Subscription.js`
Defines the MongoDB schema for subscriptions with the following key fields:

```javascript
{
  planName: 'Basic' | 'Premium' | 'Enterprise',
  userId: ObjectId,                    // Reference to Tenant or Landlord
  userType: 'tenant' | 'landlord' | 'admin',
  status: 'active' | 'inactive' | 'expired' | 'cancelled' | 'suspended',
  amount: Number,
  currency: 'INR',
  duration: Number,
  durationType: 'days' | 'months' | 'years',
  startDate: Date,
  endDate: Date,
  expiryDate: Date,
  paymentMethod: 'card' | 'upi' | 'netbanking' | 'wallet' | 'manual',
  paymentStatus: 'pending' | 'completed' | 'failed' | 'refunded',
  transactionId: String,
  features: [String],
  autoRenew: Boolean,
  isFreeTrial: Boolean,
  renewalCount: Number
}
```

### 2. **Subscription Controller** - `/src/controllers/subscriptionController.js`
Contains all business logic for subscription operations.

### 3. **Subscription Routes** - `/src/routes/subscriptionRoutes.js`
API endpoints for subscription management.

### 4. **Updated App Configuration** - `/src/app.js`
Routes registered at `/api/subscription`

---

## API Endpoints

### 1. **Buy a Subscription** ⭐
Create a new subscription for a user.

```http
POST /api/subscription/buy
Content-Type: application/json

{
  "userId": "65f2c3d4e5f6a7b8c9d0e1f2",
  "userType": "tenant",
  "planName": "Premium",
  "amount": 999,
  "duration": 12,
  "durationType": "months",
  "paymentMethod": "card",
  "paymentId": "pay_123456",
  "transactionId": "txn_123456",
  "autoRenew": true,
  "isFreeTrial": false,
  "features": ["priority-support", "advanced-analytics"]
}
```

**Request Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| userId | String | ✓ | - | User ID (Tenant/Landlord ObjectId) |
| userType | String | ✓ | - | 'tenant' or 'landlord' |
| planName | String | ✓ | Basic | 'Basic', 'Premium', 'Enterprise' |
| amount | Number | ✓ | - | Subscription price |
| duration | Number | ✓ | 30 | Duration value |
| durationType | String | ✗ | months | 'days', 'months', or 'years' |
| paymentMethod | String | ✗ | card | Payment method |
| paymentId | String | ✗ | null | Payment gateway ID |
| transactionId | String | ✗ | null | Transaction reference ID |
| autoRenew | Boolean | ✗ | true | Auto-renew on expiry |
| isFreeTrial | Boolean | ✗ | false | Is this a free trial |
| features | Array | ✗ | [] | List of features included |

**Success Response (201):**
```json
{
  "message": "Subscription purchased successfully",
  "subscription": {
    "_id": "65f2c3d4e5f6a7b8c9d0e1f3",
    "userId": "65f2c3d4e5f6a7b8c9d0e1f2",
    "userType": "tenant",
    "planName": "Premium",
    "amount": 999,
    "status": "active",
    "startDate": "2024-12-22T10:00:00.000Z",
    "endDate": "2025-12-22T10:00:00.000Z",
    "expiryDate": "2025-12-22T10:00:00.000Z",
    "paymentStatus": "completed",
    "renewalCount": 0,
    "createdAt": "2024-12-22T10:00:00.000Z"
  },
  "expiryIn": "365 days"
}
```

**Error Response (400/404/500):**
```json
{
  "message": "Error message",
  "error": "Detailed error description"
}
```

---

### 2. **Get Subscription by User ID**
Retrieve subscription details for a specific user.

```http
GET /api/subscription/65f2c3d4e5f6a7b8c9d0e1f2
```

**Response (200):**
```json
{
  "message": "Subscription retrieved successfully",
  "subscription": {
    "_id": "65f2c3d4e5f6a7b8c9d0e1f3",
    "userId": {
      "_id": "65f2c3d4e5f6a7b8c9d0e1f2",
      "name": "John Doe",
      "email": "john@example.com",
      "mobile": "9876543210"
    },
    "planName": "Premium",
    "status": "active",
    "expiryDate": "2025-12-22T10:00:00.000Z"
  }
}
```

---

### 3. **Get All Subscriptions** (with Filters & Pagination)
Retrieve all subscriptions with optional filtering.

```http
GET /api/subscription/list/all?status=active&userType=tenant&planName=Premium&page=1&limit=10
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| status | String | Filter by status |
| userType | String | Filter by user type (tenant/landlord) |
| planName | String | Filter by plan name |
| page | Number | Page number (default: 1) |
| limit | Number | Records per page (default: 10) |

**Response (200):**
```json
{
  "message": "Subscriptions retrieved successfully",
  "subscriptions": [...],
  "pagination": {
    "total": 50,
    "page": 1,
    "limit": 10,
    "pages": 5
  }
}
```

---

### 4. **Check Subscription Status**
Check if a user has an active subscription and remaining days.

```http
GET /api/subscription/status/65f2c3d4e5f6a7b8c9d0e1f2
```

**Response (200) - Active:**
```json
{
  "message": "Subscription is active",
  "isActive": true,
  "daysRemaining": 250,
  "subscription": {...}
}
```

**Response (200) - Expired:**
```json
{
  "message": "Subscription has expired",
  "isActive": false,
  "isExpired": true,
  "subscription": {...}
}
```

**Response (200) - No Subscription:**
```json
{
  "message": "No active subscription found",
  "isActive": false,
  "subscription": null
}
```

---

### 5. **Renew Subscription**
Extend an existing subscription.

```http
POST /api/subscription/renew/65f2c3d4e5f6a7b8c9d0e1f3
Content-Type: application/json

{
  "amount": 999,
  "duration": 12,
  "durationType": "months"
}
```

**Response (200):**
```json
{
  "message": "Subscription renewed successfully",
  "subscription": {...},
  "newExpiryDate": "2026-12-22T10:00:00.000Z"
}
```

---

### 6. **Cancel Subscription**
Cancel a subscription.

```http
POST /api/subscription/cancel/65f2c3d4e5f6a7b8c9d0e1f3
Content-Type: application/json

{
  "cancellationReason": "User requested cancellation"
}
```

**Response (200):**
```json
{
  "message": "Subscription cancelled successfully",
  "subscription": {
    "status": "cancelled",
    "cancellationDate": "2024-12-22T10:00:00.000Z"
  }
}
```

---

### 7. **Update Subscription** (Admin)
Modify subscription details.

```http
PATCH /api/subscription/65f2c3d4e5f6a7b8c9d0e1f3
Content-Type: application/json

{
  "amount": 1299,
  "status": "active",
  "features": ["feature1", "feature2"],
  "autoRenew": true,
  "remarks": "Updated plan"
}
```

**Response (200):**
```json
{
  "message": "Subscription updated successfully",
  "subscription": {...}
}
```

---

### 8. **Delete Subscription** (Admin)
Permanently delete a subscription.

```http
DELETE /api/subscription/65f2c3d4e5f6a7b8c9d0e1f3
```

**Response (200):**
```json
{
  "message": "Subscription deleted successfully",
  "subscription": {...}
}
```

---

## Usage Examples

### Example 1: Tenant Buying Premium Subscription
```bash
curl -X POST http://localhost:8000/api/subscription/buy \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "65f2c3d4e5f6a7b8c9d0e1f2",
    "userType": "tenant",
    "planName": "Premium",
    "amount": 999,
    "duration": 1,
    "durationType": "months",
    "paymentMethod": "card",
    "paymentId": "pay_K8ZK2JPW8SX2R5",
    "transactionId": "txn_1234567890",
    "autoRenew": true
  }'
```

### Example 2: Check User Subscription Status
```bash
curl -X GET http://localhost:8000/api/subscription/status/65f2c3d4e5f6a7b8c9d0e1f2
```

### Example 3: Get All Active Subscriptions for Landlords
```bash
curl -X GET "http://localhost:8000/api/subscription/list/all?status=active&userType=landlord&limit=20"
```

### Example 4: Renew Subscription
```bash
curl -X POST http://localhost:8000/api/subscription/renew/65f2c3d4e5f6a7b8c9d0e1f3 \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 999,
    "duration": 12,
    "durationType": "months"
  }'
```

---

## Features

✅ **Multiple Plan Types**: Basic, Premium, Enterprise  
✅ **Flexible Duration**: Days, Months, or Years  
✅ **Multiple Payment Methods**: Card, UPI, NetBanking, Wallet, Manual  
✅ **Auto-Renewal**: Automatic subscription renewal  
✅ **Free Trial Support**: Offer trial subscriptions  
✅ **Subscription Features**: Assign features to plans  
✅ **Pagination & Filtering**: Efficient data retrieval  
✅ **Status Tracking**: Active, Inactive, Expired, Cancelled, Suspended  
✅ **Renewal Count**: Track subscription renewal history  
✅ **Expiry Notifications**: Track and manage expiring subscriptions  

---

## Database Indexes

The Subscription model includes the following indexes for optimal query performance:
- `userId` - Fast user lookups
- `status` - Filter by subscription status
- `userType` - Filter by user type
- `expiryDate` - Find expiring subscriptions

---

## Integration Notes

1. **Authentication**: Consider adding authentication middleware to protected routes
2. **Payment Gateway**: Integrate with Razorpay, Stripe, or your preferred payment provider
3. **Notifications**: Send email/SMS notifications on purchase, renewal, and expiry
4. **Cron Jobs**: Set up automatic expiry status updates
5. **Analytics**: Track subscription revenue and retention metrics

---

## Error Handling

The API includes comprehensive error handling:
- **400**: Bad Request (missing/invalid parameters)
- **404**: Resource Not Found
- **500**: Server Error

All errors include descriptive messages to aid debugging.
