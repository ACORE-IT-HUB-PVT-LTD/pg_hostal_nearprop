const express = require('express');
const router = express.Router();
const subscriptionPlanController = require('../controllers/subscriptionPlanController');


router.get('/', (req, res) => {
  res.status(200).json({ message: 'Subscription Plan Routes Working' });
});
/**
 * Create a new subscription plan (Admin)
 * POST /api/subscription-plans/create
 */
router.post('/create',subscriptionPlanController.createPlan);



/**
 * Seed default subscription plans (Admin)
 * POST /api/subscription-plans/seed/default
 */
router.post('/seed/default', subscriptionPlanController.seedDefaultPlans);

/**
 * Get all subscription plans (with filters & pagination)
 * GET /api/subscription-plans/list/all
 */
router.get('/list/all', subscriptionPlanController.getAllPlans);

/**
 * Get public subscription plans (for website display)
 * GET /api/subscription-plans/public/available
 */
router.get('/public/available', subscriptionPlanController.getPublicPlans);

/**
 * Get plan pricing with discount calculations
 * GET /api/subscription-plans/:id/pricing
 */
router.get('/:id/pricing', subscriptionPlanController.getPlanPricing);

/**
 * Deactivate a subscription plan
 * POST /api/subscription-plans/:id/deactivate
 */
router.post('/:id/deactivate', subscriptionPlanController.deactivatePlan);

/**
 * Activate a subscription plan
 * POST /api/subscription-plans/:id/activate
 */
router.post('/:id/activate', subscriptionPlanController.activatePlan);

/**
 * Get a single subscription plan by ID or name
 * GET /api/subscription-plans/:id
 */
router.get('/:id', subscriptionPlanController.getPlanById);

/**
 * Update a subscription plan (Admin)
 * PATCH /api/subscription-plans/:id
 */
router.patch('/:id', subscriptionPlanController.updatePlan);

/**
 * Delete a subscription plan (Admin)
 * DELETE /api/subscription-plans/:id
 */
router.delete('/:id', subscriptionPlanController.deletePlan);

module.exports = router;
