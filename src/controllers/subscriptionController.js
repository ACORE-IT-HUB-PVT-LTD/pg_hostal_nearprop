const Subscription = require('../models/Subscription');
const Tenant = require('../models/Tenant');
const Landlord = require('../models/Landlord');
const mongoose = require('mongoose');

/**
 * Buy a subscription for a user
 * @route POST /api/subscription/buy
 * @body {string} userId - User ID (Tenant or Landlord)
 * @body {string} userType - 'tenant' or 'landlord'
 * @body {string} plan_id - SubscriptionPlan ID
 * @body {string} plan_name - Plan name
 * @body {number} amount - Amount
 * @body {string} billing_cycle - 'monthly' | 'quarterly' | 'yearly'
 * @body {boolean} auto_renew - Optional
 * @body {string} payment.provider - Optional (razorpay/stripe)
 * @body {string} payment.order_id - Optional
 * @body {string} payment.payment_id - Optional
 */
const buySubscription = async (req, res) => {
  const {
    userId,
    userType,
    plan_id,
    plan_name,
    amount,
    billing_cycle,
    auto_renew = false,
    payment = {}, // { provider, order_id, payment_id, payment_status }
  } = req.body;

  try {
    // Validate required fields
    if (!userId || !userType || !plan_id || !plan_name || !amount || !billing_cycle) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    if (!['tenant', 'landlord'].includes(userType)) {
      return res.status(400).json({ message: 'Invalid user type (tenant or landlord only)' });
    }

    if (!['monthly', 'quarterly', 'yearly'].includes(billing_cycle)) {
      return res.status(400).json({ message: 'Invalid billing cycle' });
    }

    // Validate user exists
    let user;
    if (userType === 'tenant') {
      user = await Tenant.findById(userId);
      if (!user) return res.status(404).json({ message: 'Tenant not found' });
    } else {
      user = await Landlord.findById(userId);
      if (!user) return res.status(404).json({ message: 'Landlord not found' });
    }

    // Check for active subscription
    const activeSub = await Subscription.findOne({
      user_id: userId,
      status: 'active',
    });

    if (activeSub) {
      return res.status(400).json({ message: 'User already has an active subscription' });
    }

    // Calculate dates
    const start_date = new Date();
    const end_date = new Date(start_date);

    if (billing_cycle === 'monthly') end_date.setMonth(end_date.getMonth() + 1);
    else if (billing_cycle === 'quarterly') end_date.setMonth(end_date.getMonth() + 3);
    else if (billing_cycle === 'yearly') end_date.setFullYear(end_date.getFullYear() + 1);

    // Create subscription
    const subscription = new Subscription({
      user_id: userId,
      plan_id,
      plan_name,
      amount,
      currency: 'INR',
      billing_cycle,
      start_date,
      end_date,
      status: 'active', // initially pending until payment
      auto_renew,
      payment: {
        provider: payment.provider || null,
        order_id: payment.order_id || null,
        payment_id: payment.payment_id || null,
        payment_status: payment.payment_status || 'pending',
        paid_at: payment.payment_status === 'success' ? new Date() : null,
      },
      metadata: req.body.metadata || {},
    });

    await subscription.save();

    res.status(201).json({
      message: 'Subscription created successfully',
      subscription,
    });
  } catch (error) {
    console.error('Buy subscription error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get subscription details by user ID
 * @route GET /api/subscription/:userId
 */
const getSubscriptionByLandlordId = async (req, res) => {
  try {
    const { landlordId } = req.params;

    const subscription = await Subscription.findOne({ landlord_id: landlordId })
      .populate({
        path: "_id",
        select: "name mobile email",
      })
      .populate("plan_id")
      .sort({ createdAt: -1 });

    if (!subscription) {
      return res.status(404).json({ message: "No subscription found" });
    }

    res.status(200).json({
      message: "Success",
      subscription,
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};



/**
 * Get all subscriptions (with filters & pagination)
 * @route GET /api/subscription/list/all
 */
const getAllSubscriptions = async (req, res) => {
  try {
    const { status, userType, planName, page = 1, limit = 10 } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (userType) filter.userType = userType; // Note: schema has no userType, so remove if not needed
    if (planName) filter.plan_name = planName;

    const skip = (page - 1) * limit;

    const subscriptions = await Subscription.find(filter)
      .populate('plan_id')
      .populate('user_id', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Subscription.countDocuments(filter);

    res.status(200).json({
      message: 'Success',
      subscriptions,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Renew subscription
 * @route POST /api/subscription/renew/:subscriptionId
 */
const renewSubscription = async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const { amount, billing_cycle, duration_days } = req.body;

    // ✅ Correct findById usage
    const subscription = await Subscription.findOne({ plan_id: subscriptionId });
    if (!subscription) {
      return res.status(404).json({ message: 'Subscription not found' });
    }

    const start_date = new Date();
    const end_date = new Date(start_date);

    // ✅ Use duration_days if provided
    if (duration_days && Number.isInteger(duration_days) && duration_days > 0) {
      end_date.setDate(end_date.getDate() + duration_days);
    } else {
      // fallback based on billing_cycle
      if (billing_cycle === 'monthly') end_date.setMonth(end_date.getMonth() + 1);
      else if (billing_cycle === 'quarterly') end_date.setMonth(end_date.getMonth() + 3);
      else if (billing_cycle === 'yearly') end_date.setFullYear(end_date.getFullYear() + 1);
    }

    // ✅ Update subscription
    subscription.start_date = start_date;
    subscription.end_date = end_date;
    subscription.amount = amount || subscription.amount;
    subscription.status = 'active';
    subscription.auto_renew = true;
    subscription.payment.paid_at = new Date();
    subscription.payment.payment_status = 'success';

    await subscription.save();

    res.status(200).json({ message: 'Subscription renewed', subscription });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};


/**
 * Cancel subscription
 * @route POST /api/subscription/cancel/:subscriptionId
 */
const cancelSubscription = async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const { reason } = req.body;

    const subscription = await Subscription.findById(subscriptionId);
    if (!subscription) return res.status(404).json({ message: 'Subscription not found' });

    subscription.status = 'cancelled';
    subscription.cancelled_at = new Date();
    subscription.metadata = { ...subscription.metadata, cancellation_reason: reason };

    await subscription.save();

    res.status(200).json({ message: 'Subscription cancelled', subscription });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Check subscription status
 * @route GET /api/subscription/status/:userId
 */
const checkSubscriptionStatus = async (req, res) => {
  try {
    const { userId } = req.params;

    const subscription = await Subscription.findOne({ user_id: userId });

    if (!subscription) {
      return res.status(200).json({ isActive: false, message: 'No subscription' });
    }

    const now = new Date();
    const isExpired = subscription.end_date < now;

    if (isExpired && subscription.status === 'active') {
      subscription.status = 'expired';
      await subscription.save();
    }

    const daysRemaining = Math.max(0, Math.ceil((subscription.end_date - now) / (1000 * 60 * 60 * 24)));

    res.status(200).json({
      isActive: subscription.status === 'active' && !isExpired,
      daysRemaining,
      subscription,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Admin routes (update & delete) remain mostly the same but use correct fields
const updateSubscription = async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const updates = req.body;

    const subscription = await Subscription.findByIdAndUpdate(subscriptionId, updates, { new: true });
    if (!subscription) return res.status(404).json({ message: 'Subscription not found' });

    res.status(200).json({ message: 'Updated', subscription });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const deleteSubscription = async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const subscription = await Subscription.findByIdAndDelete(subscriptionId);
    if (!subscription) return res.status(404).json({ message: 'Subscription not found' });

    res.status(200).json({ message: 'Deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  buySubscription,
  getSubscriptionByLandlordId,
  getAllSubscriptions,
  renewSubscription,
  cancelSubscription,
  checkSubscriptionStatus,
  updateSubscription,
  deleteSubscription,
};