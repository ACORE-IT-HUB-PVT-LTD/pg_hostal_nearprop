const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const auth = require('../middleware/auth');

/**
 * Buy Subscription
 * POST /api/subscription/buy
 * Required: userId, userType, planName, amount, duration
 */
router.post('/buy',auth.required, subscriptionController.buySubscription);

/**
 * Get Subscription by User ID
 * GET /api/subscription/:userId
 */
router.get('/:userId', subscriptionController.getSubscriptionByLandlordId);

/**
 * Get All Subscriptions (with filters and pagination)
 * GET /api/subscription/list/all
 */
router.get('/list/all', subscriptionController.getAllSubscriptions);

/**
 * Check Subscription Status
 * GET /api/subscription/status/:userId
 */
router.get('/status/:userId', subscriptionController.checkSubscriptionStatus);

/**
 * Renew Subscription
 * POST /api/subscription/renew/:subscriptionId
 */
router.post('/renew/:subscriptionId', subscriptionController.renewSubscription);

/**
 * Cancel Subscription
 * POST /api/subscription/cancel/:subscriptionId
 */
router.post('/cancel/:subscriptionId', subscriptionController.cancelSubscription);

/**
 * Update Subscription (Admin)
 * PATCH /api/subscription/:subscriptionId
 */
router.patch('/:subscriptionId', subscriptionController.updateSubscription);

/**
 * Delete Subscription (Admin)
 * DELETE /api/subscription/:subscriptionId
 */
router.delete('/:subscriptionId', subscriptionController.deleteSubscription);

module.exports = router;
