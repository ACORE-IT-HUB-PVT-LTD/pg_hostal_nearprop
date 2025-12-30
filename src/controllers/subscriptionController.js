const Subscription = require('../models/Subscription');
const Tenant = require('../models/Tenant');
const Landlord = require('../models/Landlord');
const mongoose = require('mongoose');
const SubscriptionPlan = require('../models/SubscriptionPlan');

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
  try {
    const {
      userId,
      plan_id,
      billing_cycle,
      auto_renew = false,
      payment = {},
    } = req.body;

    // =============================
    // 1️⃣ BASIC VALIDATION
    // =============================
    if (!userId || !plan_id || !billing_cycle) {
      return res.status(400).json({
        message: "Missing required fields",
      });
    }

    if (!["monthly", "quarterly", "yearly"].includes(billing_cycle)) {
      return res.status(400).json({
        message: "Invalid billing cycle",
      });
    }

    // =============================
    // 2️⃣ VALIDATE LANDLORD
    // =============================
    const landlord = await Landlord.findById(userId);
    if (!landlord) {
      return res.status(404).json({
        message: "Landlord not found",
      });
    }

    // =============================
    // 3️⃣ FETCH PLAN (SECURE)
    // =============================
    const plan = await SubscriptionPlan.findById(plan_id);
    if (!plan) {
      return res.status(404).json({
        message: "Subscription plan not found",
      });
    }

    // =============================
    // 4️⃣ CHECK ACTIVE SUBSCRIPTION
    // =============================
    const activeSub = await Subscription.findOne({
      landlordId: userId,
      status: "active",
    });

    // =============================
    // 5️⃣ DATE CALCULATION FUNCTION
    // =============================
    const calculateEndDate = (start, cycle) => {
      const date = new Date(start);

      if (cycle === "monthly") date.setMonth(date.getMonth() + 1);
      if (cycle === "quarterly") date.setMonth(date.getMonth() + 3);
      if (cycle === "yearly") date.setFullYear(date.getFullYear() + 1);

      return date;
    };

    // ==================================================
    // ✅ CASE 1: ACTIVE SUBSCRIPTION → UPGRADE / TOP-UP
    // ==================================================
    if (activeSub) {
      // Extend from future date if still valid
      const baseDate =
        activeSub.end_date > new Date()
          ? activeSub.end_date
          : new Date();

      activeSub.end_date = calculateEndDate(baseDate, billing_cycle);

      // Increase property limit
      activeSub.property_limit += plan.property_limit;

      // Update amount (optional: cumulative)
      activeSub.amount += plan.price;

      // Save payment history
      activeSub.payment_history.push({
        plan_id: plan._id,
        plan_name: plan.name,
        amount: plan.price,
        billing_cycle,
        paid_at: new Date(),
        payment,
      });

      await activeSub.save();

      return res.status(200).json({
        message: "Subscription upgraded successfully",
        subscription: activeSub,
      });
    }

    // ==================================================
    // ✅ CASE 2: NO ACTIVE SUB → CREATE NEW
    // ==================================================
    const start_date =
      payment.payment_status === "success" ? new Date() : null;

    const end_date =
      payment.payment_status === "success"
        ? calculateEndDate(start_date, billing_cycle)
        : null;

    const subscription = new Subscription({
      landlordId: userId,
      plan_id: plan._id,
      plan_name: plan.name,
      property_limit: plan.property_limit,
      amount: plan.price,
      currency: "INR",
      billing_cycle,
      start_date,
      end_date,
      status:
        payment.payment_status === "success" ? "active" : "pending",
      auto_renew,
      payment: {
        provider: payment.provider || null,
        order_id: payment.order_id || null,
        payment_id: payment.payment_id || null,
        payment_status: payment.payment_status || "pending",
        paid_at:
          payment.payment_status === "success" ? new Date() : null,
      },
      payment_history: [
        {
          plan_id: plan._id,
          plan_name: plan.name,
          amount: plan.price,
          billing_cycle,
          paid_at: new Date(),
          payment,
        },
      ],
    });

    await subscription.save();

    return res.status(201).json({
      message: "Subscription created successfully",
      subscription,
    });
  } catch (error) {
    console.error("Buy subscription error:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};


/**
 * Get subscription details by user ID
 * @route GET /api/subscription/:userId
 */
const getSubscriptionByLandlordId = async (req, res) => {
  try {
    const { landlordId } = req.params;

    const subscription = await Subscription.findOne({ landlordId: landlordId })
      .populate({
        path: "landlordId",
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
