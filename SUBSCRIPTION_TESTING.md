# Subscription API - Testing Guide

## Quick Test Cases

### Prerequisites
- Backend server running on `http://localhost:8000`
- A valid user ID (Tenant or Landlord ObjectId)
- Use any REST client (Postman, Insomnia, cURL, Thunder Client)

---

## Test 1: Buy Subscription

**Endpoint:** `POST /api/subscription/buy`

**Request:**
```json
{
  "userId": "65f2c3d4e5f6a7b8c9d0e1f2",
  "userType": "tenant",
  "planName": "Premium",
  "amount": 999,
  "duration": 12,
  "durationType": "months",
  "paymentMethod": "card",
  "paymentId": "pay_K8ZK2JPW8SX2R5",
  "transactionId": "txn_1704081600000",
  "autoRenew": true,
  "features": ["priority-support", "advanced-analytics", "bulk-uploads"]
}
```

**Expected Success Response (201):**
```json
{
  "message": "Subscription purchased successfully",
  "subscription": {
    "_id": "65f2c3d4e5f6a7b8c9d0e1f3",
    "userId": "65f2c3d4e5f6a7b8c9d0e1f2",
    "userType": "tenant",
    "planName": "Premium",
    "amount": 999,
    "duration": 12,
    "durationType": "months",
    "status": "active",
    "startDate": "2024-12-22T10:00:00.000Z",
    "endDate": "2025-12-22T10:00:00.000Z",
    "paymentMethod": "card",
    "paymentStatus": "completed",
    "autoRenew": true,
    "features": ["priority-support", "advanced-analytics", "bulk-uploads"],
    "renewalCount": 0,
    "createdAt": "2024-12-22T10:00:00.000Z"
  },
  "expiryIn": "365 days"
}
```

**Test Cases:**
- ✅ Missing userId → 400 error
- ✅ Invalid userType → 400 error
- ✅ Invalid amount → 400 error
- ✅ Non-existent user → 404 error
- ✅ Duplicate active subscription → 400 error

---

## Test 2: Get Subscription by User ID

**Endpoint:** `GET /api/subscription/65f2c3d4e5f6a7b8c9d0e1f2`

**Expected Response (200):**
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
    "amount": 999,
    "status": "active",
    "expiryDate": "2025-12-22T10:00:00.000Z",
    "features": ["priority-support", "advanced-analytics", "bulk-uploads"]
  }
}
```

**Test Cases:**
- ✅ Valid user with subscription
- ✅ Valid user without subscription → 404 error
- ✅ Missing userId → 400 error
- ✅ Invalid userId format → 500 error

---

## Test 3: Check Subscription Status

**Endpoint:** `GET /api/subscription/status/65f2c3d4e5f6a7b8c9d0e1f2`

**Active Subscription Response (200):**
```json
{
  "message": "Subscription is active",
  "isActive": true,
  "daysRemaining": 250,
  "subscription": {
    "_id": "65f2c3d4e5f6a7b8c9d0e1f3",
    "planName": "Premium",
    "status": "active",
    "expiryDate": "2025-12-22T10:00:00.000Z"
  }
}
```

**No Subscription Response (200):**
```json
{
  "message": "No active subscription found",
  "isActive": false,
  "subscription": null
}
```

**Test Cases:**
- ✅ User with active subscription
- ✅ User without subscription
- ✅ User with expired subscription (auto-updates status)
- ✅ Missing userId → 400 error

---

## Test 4: Get All Subscriptions (with Filters)

**Endpoint:** `GET /api/subscription/list/all?status=active&userType=tenant&page=1&limit=10`

**Expected Response (200):**
```json
{
  "message": "Subscriptions retrieved successfully",
  "subscriptions": [
    {
      "_id": "65f2c3d4e5f6a7b8c9d0e1f3",
      "userId": {...},
      "planName": "Premium",
      "status": "active",
      "amount": 999
    }
  ],
  "pagination": {
    "total": 25,
    "page": 1,
    "limit": 10,
    "pages": 3
  }
}
```

**Filter Test Cases:**
- ✅ Filter by status=active
- ✅ Filter by userType=landlord
- ✅ Filter by planName=Enterprise
- ✅ Combine multiple filters
- ✅ Pagination with page=2, limit=5
- ✅ No filters (returns all)

---

## Test 5: Renew Subscription

**Endpoint:** `POST /api/subscription/renew/65f2c3d4e5f6a7b8c9d0e1f3`

**Request:**
```json
{
  "amount": 999,
  "duration": 12,
  "durationType": "months"
}
```

**Expected Response (200):**
```json
{
  "message": "Subscription renewed successfully",
  "subscription": {
    "_id": "65f2c3d4e5f6a7b8c9d0e1f3",
    "status": "active",
    "renewalCount": 1,
    "renewalDate": "2024-12-22T10:00:00.000Z",
    "expiryDate": "2026-12-22T10:00:00.000Z"
  },
  "newExpiryDate": "2026-12-22T10:00:00.000Z"
}
```

**Test Cases:**
- ✅ Renew active subscription
- ✅ Update amount during renewal
- ✅ Different duration types (days, months, years)
- ✅ Invalid subscription ID → 404 error

---

## Test 6: Cancel Subscription

**Endpoint:** `POST /api/subscription/cancel/65f2c3d4e5f6a7b8c9d0e1f3`

**Request:**
```json
{
  "cancellationReason": "User no longer needs the service"
}
```

**Expected Response (200):**
```json
{
  "message": "Subscription cancelled successfully",
  "subscription": {
    "_id": "65f2c3d4e5f6a7b8c9d0e1f3",
    "status": "cancelled",
    "cancellationReason": "User no longer needs the service",
    "cancellationDate": "2024-12-22T10:00:00.000Z"
  }
}
```

**Test Cases:**
- ✅ Cancel active subscription
- ✅ Cancel with reason
- ✅ Cancel already cancelled subscription
- ✅ Invalid subscription ID → 404 error

---

## Test 7: Update Subscription (Admin)

**Endpoint:** `PATCH /api/subscription/65f2c3d4e5f6a7b8c9d0e1f3`

**Request:**
```json
{
  "amount": 1299,
  "status": "active",
  "features": ["feature1", "feature2", "feature3"],
  "autoRenew": true,
  "remarks": "Updated to higher tier"
}
```

**Expected Response (200):**
```json
{
  "message": "Subscription updated successfully",
  "subscription": {
    "_id": "65f2c3d4e5f6a7b8c9d0e1f3",
    "amount": 1299,
    "features": ["feature1", "feature2", "feature3"],
    "remarks": "Updated to higher tier",
    "updatedAt": "2024-12-22T10:00:00.000Z"
  }
}
```

**Test Cases:**
- ✅ Update single field (amount)
- ✅ Update multiple fields
- ✅ Update features array
- ✅ Update status
- ✅ Invalid subscription ID → 404 error

---

## Test 8: Delete Subscription (Admin)

**Endpoint:** `DELETE /api/subscription/65f2c3d4e5f6a7b8c9d0e1f3`

**Expected Response (200):**
```json
{
  "message": "Subscription deleted successfully",
  "subscription": {
    "_id": "65f2c3d4e5f6a7b8c9d0e1f3",
    "userId": "65f2c3d4e5f6a7b8c9d0e1f2"
  }
}
```

**Test Cases:**
- ✅ Delete existing subscription
- ✅ Delete already deleted subscription → 404 error
- ✅ Invalid subscription ID → 404 error

---

## cURL Command Examples

### Buy Subscription
```bash
curl -X POST http://localhost:8000/api/subscription/buy \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "65f2c3d4e5f6a7b8c9d0e1f2",
    "userType": "tenant",
    "planName": "Premium",
    "amount": 999,
    "duration": 12,
    "durationType": "months",
    "paymentMethod": "card"
  }'
```

### Get Subscription
```bash
curl -X GET http://localhost:8000/api/subscription/65f2c3d4e5f6a7b8c9d0e1f2
```

### Check Status
```bash
curl -X GET http://localhost:8000/api/subscription/status/65f2c3d4e5f6a7b8c9d0e1f2
```

### Get All (Filtered)
```bash
curl -X GET "http://localhost:8000/api/subscription/list/all?status=active&userType=tenant&limit=5"
```

### Renew
```bash
curl -X POST http://localhost:8000/api/subscription/renew/65f2c3d4e5f6a7b8c9d0e1f3 \
  -H "Content-Type: application/json" \
  -d '{
    "duration": 12,
    "durationType": "months"
  }'
```

### Cancel
```bash
curl -X POST http://localhost:8000/api/subscription/cancel/65f2c3d4e5f6a7b8c9d0e1f3 \
  -H "Content-Type: application/json" \
  -d '{"cancellationReason": "No longer needed"}'
```

### Update
```bash
curl -X PATCH http://localhost:8000/api/subscription/65f2c3d4e5f6a7b8c9d0e1f3 \
  -H "Content-Type: application/json" \
  -d '{"status": "active", "amount": 1299}'
```

### Delete
```bash
curl -X DELETE http://localhost:8000/api/subscription/65f2c3d4e5f6a7b8c9d0e1f3
```

---

## Postman Collection Example

You can import this into Postman:

```json
{
  "info": {
    "name": "Subscription API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Buy Subscription",
      "request": {
        "method": "POST",
        "url": "http://localhost:8000/api/subscription/buy",
        "header": [{"key": "Content-Type", "value": "application/json"}],
        "body": {
          "mode": "raw",
          "raw": "{\"userId\":\"65f2c3d4e5f6a7b8c9d0e1f2\",\"userType\":\"tenant\",\"planName\":\"Premium\",\"amount\":999,\"duration\":12,\"durationType\":\"months\"}"
        }
      }
    }
  ]
}
```

---

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| 400 User ID is required | Pass userId in request body |
| 404 Tenant not found | Use valid tenant ID from database |
| 400 User already has active subscription | Cancel existing subscription first |
| 500 Cannot convert ObjectId | Use valid MongoDB ObjectId format |
| Invalid duration value | Use positive number, check durationType |

---

## Performance Testing

Test with large datasets:
```bash
# Get subscriptions with pagination
curl "http://localhost:8000/api/subscription/list/all?page=10&limit=100"

# Filter by multiple criteria
curl "http://localhost:8000/api/subscription/list/all?status=active&userType=landlord&planName=Premium"
```

Expected response time: < 200ms with indexed fields

---

## Database Validation

Check subscription creation in MongoDB:

```javascript
db.subscriptions.find({ userId: ObjectId("65f2c3d4e5f6a7b8c9d0e1f2") })
db.subscriptions.countDocuments({ status: "active" })
db.subscriptions.find({ expiryDate: { $lt: new Date() } })
```

