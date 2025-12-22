# Subscription Feature - Visual Architecture

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Client Application                            │
│                    (Web/Mobile)                                  │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │   API Gateway/Express      │
        │    (app.js)                │
        └────────────┬───────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │   Routes                   │
        │  /api/subscription/*       │
        │  (subscriptionRoutes.js)   │
        └────────────┬───────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │   Controller               │
        │ (subscriptionController)   │
        └────────────┬───────────────┘
                     │
         ┌───────────┼───────────┐
         ▼           ▼           ▼
    ┌────────┐ ┌─────────┐ ┌──────────┐
    │ Tenant │ │Landlord │ │   User   │
    │ Model  │ │ Model   │ │  Model   │
    └────────┘ └─────────┘ └──────────┘
         │           │           │
         └───────────┼───────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │  Subscription Model        │
        │  (subscriptionSchema)      │
        └────────────┬───────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │  MongoDB Database          │
        │  (Subscriptions Collection)│
        └────────────────────────────┘
```

---

## Database Schema Relationships

```
User (Tenant/Landlord)
│
├─ _id (ObjectId)
├─ name
├─ email
└─ mobile
   │
   └─────────────────────────┐
                             │
                     ┌───────▼──────────────┐
                     │   Subscription       │
                     ├─────────────────────┤
                     │ _id                 │
                     │ userId ─────────┐   │
                     │ userType        │   │
                     │ planName        │   │
                     │ amount          │   │
                     │ status          │   │
                     │ startDate       │   │
                     │ endDate         │   │
                     │ expiryDate      │   │
                     │ paymentStatus   │   │
                     │ transactionId   │   │
                     │ features[]      │   │
                     │ autoRenew       │   │
                     │ renewalCount    │   │
                     │ createdAt       │   │
                     │ updatedAt       │   │
                     └──────┬──────────────┘
                            │
                     ┌──────▼──────────┐
                     │  Payment Info   │
                     │  (Embedded)     │
                     │  - paymentId    │
                     │  - paymentDate  │
                     │  - paymentMethod│
                     │  - status       │
                     └─────────────────┘
```

---

## API Flow Diagram

### Buy Subscription Flow

```
Request: POST /api/subscription/buy
{
  userId: "65f2c3d4e5f6a7b8c9d0e1f2",
  userType: "tenant",
  planName: "Premium",
  amount: 999,
  duration: 12,
  durationType: "months",
  ...
}
  │
  ▼
[Validate Request]
  ├─ userId exists?
  ├─ userType valid?
  ├─ amount > 0?
  └─ duration > 0?
  │
  ├─ NO ──→ Return 400 Error
  │
  └─ YES
     │
     ▼
[Check User Exists]
  ├─ Query Tenant or Landlord
  │
  ├─ NOT FOUND ──→ Return 404
  │
  └─ FOUND
     │
     ▼
[Check Existing Subscription]
  ├─ Query active subscription
  │
  ├─ EXISTS ──→ Return 400 "Already has active"
  │
  └─ NOT FOUND
     │
     ▼
[Calculate Dates]
  ├─ startDate = now()
  ├─ endDate = now() + duration
  └─ expiryDate = endDate
  │
  ▼
[Create Subscription]
  ├─ Save to MongoDB
  │
  ├─ ERROR ──→ Return 500
  │
  └─ SUCCESS
     │
     ▼
[Return Response 201]
{
  message: "Subscription purchased successfully",
  subscription: {...},
  expiryIn: "365 days"
}
```

---

## Subscription Lifecycle

```
┌────────────────────────────────────────────────────────────────┐
│                    SUBSCRIPTION LIFECYCLE                       │
└────────────────────────────────────────────────────────────────┘

                        ┌─────────────────┐
                        │   PURCHASED     │
                        │   (Pending)     │
                        └────────┬────────┘
                                 │
                    ┌────────────▼───────────────┐
                    │                            │
              ┌─────▼──────┐            ┌───────▼─────┐
              │   FREE      │            │   PAYMENT   │
              │   TRIAL     │            │  COMPLETED  │
              └─────┬──────┘            └───────┬─────┘
                    │                          │
                    │    ┌──────────────────────┘
                    │    │
              ┌─────▼────▼────────┐
              │    ACTIVE         │
              │ (Subscription Ok) │
              └─────┬───────┬─────┘
                    │       │
        ┌───────────┘       └──────────────┐
        │                                  │
   ┌────▼─────────┐              ┌────────▼────────┐
   │  AUTO RENEW  │              │   MANUAL RENEW  │
   │   (If set)   │              │   (Call renew)  │
   └────┬─────────┘              └────────┬────────┘
        │                                 │
        └──────────────┬──────────────────┘
                       │
                ┌──────▼────────┐
                │  RENEWED      │
                │  (Back to end)│
                └──────┬────────┘
                       │
                ┌──────▼────────────────┐
                │  EXPIRED              │
                │  (endDate passed)     │
                └──────┬────────────────┘
                       │
        ┌──────────────┴──────────────┐
        │                             │
   ┌────▼──────┐              ┌───────▼────┐
   │  INACTIVE │              │ CANCELLED  │
   │  (No Auto)│              │ (Cancelled)│
   └───────────┘              └────────────┘
```

---

## Request/Response Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     HTTP REQUEST                             │
│                                                              │
│  POST /api/subscription/buy                                │
│  Headers: {                                                 │
│    "Content-Type": "application/json"                      │
│  }                                                          │
│  Body: {                                                    │
│    "userId": "...",                                         │
│    "userType": "tenant",                                    │
│    "planName": "Premium",                                   │
│    "amount": 999,                                           │
│    ...                                                      │
│  }                                                          │
└──────────────────┬──────────────────────────────────────────┘
                   │
    ┌──────────────┴────────────────┐
    │                               │
    ▼                               ▼
┌─────────────┐            ┌──────────────────┐
│ SUCCESS     │            │ ERROR            │
│ (201)       │            │ (400/404/500)    │
│             │            │                  │
│ {           │            │ {                │
│   message,  │            │   message,       │
│   subscription,          │   error          │
│   expiryIn  │            │ }                │
│ }           │            │                  │
└─────────────┘            └──────────────────┘
```

---

## Database Indexes

```
Subscription Collection Indexes

┌─────────────────────────────────────────┐
│ Field          │ Type   │ Purpose        │
├─────────────────────────────────────────┤
│ userId         │ Index  │ User Lookup    │
│ status         │ Index  │ Status Filter  │
│ userType       │ Index  │ Type Filter    │
│ expiryDate     │ Index  │ Expiry Check   │
└─────────────────────────────────────────┘

Query Performance:
- userId:        O(1)   Fast
- status:        O(1)   Fast
- Combined:      O(1)   Very Fast
```

---

## File Structure

```
project-root/
│
├── src/
│   │
│   ├── models/
│   │   └── Subscription.js ◄─── CREATED
│   │
│   ├── controllers/
│   │   └── subscriptionController.js ◄─── CREATED
│   │
│   ├── routes/
│   │   └── subscriptionRoutes.js ◄─── CREATED
│   │
│   └── app.js ◄─── MODIFIED (Added routes)
│
├── SUBSCRIPTION_API.md ◄─── CREATED (API Docs)
├── SUBSCRIPTION_IMPLEMENTATION.md ◄─── CREATED (Summary)
└── SUBSCRIPTION_TESTING.md ◄─── CREATED (Test Cases)
```

---

## API Endpoints Overview

```
┌────────────────────────────────────────────────────────────┐
│              SUBSCRIPTION API ENDPOINTS                     │
├────────────────────────────────────────────────────────────┤
│ METHOD │ ENDPOINT                    │ ACTION              │
├────────────────────────────────────────────────────────────┤
│ POST   │ /api/subscription/buy       │ Purchase            │
│ GET    │ /api/subscription/:userId   │ Get Details         │
│ GET    │ /api/subscription/status    │ Check Status        │
│ GET    │ /api/subscription/list/all  │ List All (Filtered) │
│ POST   │ /api/subscription/renew/:id │ Renew               │
│ POST   │ /api/subscription/cancel    │ Cancel              │
│ PATCH  │ /api/subscription/:id       │ Update (Admin)      │
│ DELETE │ /api/subscription/:id       │ Delete (Admin)      │
└────────────────────────────────────────────────────────────┘
```

---

## Status Transitions

```
┌──────────────────────────────────────────────────────────────┐
│            SUBSCRIPTION STATUS TRANSITIONS                    │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  active ─── (payment completed) ─→ active                   │
│    │                                  │                      │
│    └─ (renewal) ─────────────────────┘                      │
│                                                               │
│  active ─── (cancel) ──────────────→ cancelled              │
│                                                               │
│  active ─── (auto, endDate passed) → expired                │
│                                                               │
│  * ──────── (admin update) ─────────→ suspended             │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

---

## Key Features Map

```
┌─────────────────────────────────────────────────────────────┐
│                   FEATURE MATRIX                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ✓ Multiple Plans          ✓ Payment Tracking              │
│  ✓ User Types              ✓ Transaction Records            │
│  ✓ Flexible Duration       ✓ Auto-Renewal                  │
│  ✓ Status Management       ✓ Free Trials                   │
│  ✓ Renewal Tracking        ✓ Feature Assignment            │
│  ✓ Expiry Management       ✓ Pagination & Filters          │
│  ✓ Cancellation Reasons    ✓ Timestamps                    │
│  ✓ Admin Controls          ✓ Database Indexes              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

**Last Updated:** December 22, 2025
