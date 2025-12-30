const SubscriptionPlan = require('../models/SubscriptionPlan');
const mongoose = require('mongoose');

// Create a new subscription plan (Admin)
async function createPlan(req, res) {
  try {
    const {
      name,
      price,
      currency,
      billing_cycle,
      duration_days,
      property_limit,
      features,
      is_active,
    } = req.body;

    // =========================
    // ✅ Validation
    // =========================
    if (
      !name ||
      typeof price === "undefined" ||
      !billing_cycle ||
      !duration_days ||
      typeof property_limit === "undefined"
    ) {
      return res.status(400).json({
        message:
          "name, price, billing_cycle, duration_days, and property_limit are required",
      });
    }

    if (!Number.isInteger(duration_days) || duration_days <= 0) {
      return res.status(400).json({
        message: "duration_days must be a positive integer",
      });
    }

    if (!Number.isInteger(property_limit) || property_limit < 1) {
      return res.status(400).json({
        message: "property_limit must be an integer greater than or equal to 1",
      });
    }

    // =========================
    // ✅ Check duplicate plan
    // =========================
    const existing = await SubscriptionPlan.findOne({
      name: name.trim(),
    });

    if (existing) {
      return res.status(409).json({
        message: "Plan with the same name already exists",
      });
    }

    // =========================
    // ✅ Create plan
    // =========================
    const plan = new SubscriptionPlan({
      name: name.trim(),
      price,
      currency: currency || "INR",
      billing_cycle,
      duration_days,
      property_limit,
      features: Array.isArray(features)
        ? features
        : features
        ? [features]
        : [],
      is_active: typeof is_active === "boolean" ? is_active : true,
    });

    await plan.save();

    return res.status(201).json({
      message: "Plan created successfully",
      plan,
    });
  } catch (err) {
    console.error("createPlan error", err);
    return res.status(500).json({
      message: "Internal server error",
      error: err.message,
    });
  }
}

// Seed some default subscription plans (Admin)
async function seedDefaultPlans(req, res) {
  const defaults = [
    {
      name: 'Basic',
      price: 499,
      currency: 'INR',
      billing_cycle: 'monthly',
      features: ['List up to 1 property', 'Basic support'],
      is_active: true,
    },
    {
      name: 'Premium',
      price: 1299,
      currency: 'INR',
      billing_cycle: 'monthly',
      features: ['List up to 5 properties', 'Priority support', 'Analytics'],
      is_active: true,
    },
    {
      name: 'Enterprise',
      price: 4999,
      currency: 'INR',
      billing_cycle: 'monthly',
      features: ['Unlimited properties', 'Dedicated account manager', 'SLA support'],
      is_active: true,
    },
  ];

  try {
    const results = { created: [], updated: [], skipped: [] };

    for (const p of defaults) {
      const found = await SubscriptionPlan.findOne({ name: p.name });
      if (found) {
        const changed = (
          found.price !== p.price ||
          found.billing_cycle !== p.billing_cycle ||
          JSON.stringify(found.features || []) !== JSON.stringify(p.features || [])
        );
        if (changed) {
          found.price = p.price;
          found.billing_cycle = p.billing_cycle;
          found.currency = p.currency;
          found.features = p.features;
          found.is_active = p.is_active;
          await found.save();
          results.updated.push(p.name);
        } else {
          results.skipped.push(p.name);
        }
      } else {
        const plan = new SubscriptionPlan(p);
        await plan.save();
        results.created.push(p.name);
      }
    }

    return res.status(200).json({ message: 'Seed completed', results });
  } catch (err) {
    console.error('seedDefaultPlans error', err);
    return res.status(500).json({ message: 'Internal server error', error: err.message });
  }
}

// Get all plans (admin listing) with filters & pagination
async function getAllPlans(req, res) {
  try {
    const { page = 1, limit = 20, search, is_active, sortBy = 'createdAt', order = 'desc' } = req.query;
    const q = {};
    if (typeof is_active !== 'undefined') q.is_active = is_active === 'true' || is_active === '1';
    if (search) q.name = { $regex: search, $options: 'i' };

    const pageNum = Math.max(1, parseInt(page, 10));
    const lim = Math.max(1, parseInt(limit, 10));
    const skip = (pageNum - 1) * lim;

    const sort = {};
    sort[sortBy] = order === 'asc' ? 1 : -1;

    const [total, plans] = await Promise.all([
      SubscriptionPlan.countDocuments(q),
      SubscriptionPlan.find(q).sort(sort).skip(skip).limit(lim),
    ]);

    return res.json({ total, page: pageNum, limit: lim, plans });
  } catch (err) {
    console.error('getAllPlans error', err);
    return res.status(500).json({ message: 'Internal server error', error: err.message });
  }
}

// Public plans (for website) — only active ones
async function getPublicPlans(req, res) {
  try {
    const plans = await SubscriptionPlan.find({ is_active: true }).sort({ price: 1 });
    return res.json({ total: plans.length, plans });
  } catch (err) {
    console.error('getPublicPlans error', err);
    return res.status(500).json({ message: 'Internal server error', error: err.message });
  }
}

// Get plan pricing details — returns plan and computed monthly equivalent
async function getPlanPricing(req, res) {
  try {
    const { id } = req.params;
    let plan;
    if (mongoose.Types.ObjectId.isValid(id)) {
      plan = await SubscriptionPlan.findById(id);
    } else {
      plan = await SubscriptionPlan.findOne({ name: id });
    }

    if (!plan) return res.status(404).json({ message: 'Plan not found' });

    // compute monthly equivalent depending on billing_cycle
    let monthlyEquivalent = plan.price;
    if (plan.billing_cycle === 'yearly') monthlyEquivalent = +(plan.price / 12).toFixed(2);
    else if (plan.billing_cycle === 'quarterly') monthlyEquivalent = +(plan.price / 3).toFixed(2);

    return res.json({ plan, pricing: { price: plan.price, currency: plan.currency, billing_cycle: plan.billing_cycle, monthlyEquivalent } });
  } catch (err) {
    console.error('getPlanPricing error', err);
    return res.status(500).json({ message: 'Internal server error', error: err.message });
  }
}

// Deactivate a plan
async function deactivatePlan(req, res) {
  try {
    const { id } = req.params;
    const plan = await SubscriptionPlan.findByIdAndUpdate(id, { is_active: false }, { new: true });
    if (!plan) return res.status(404).json({ message: 'Plan not found' });
    return res.json({ message: 'Plan deactivated', plan });
  } catch (err) {
    console.error('deactivatePlan error', err);
    return res.status(500).json({ message: 'Internal server error', error: err.message });
  }
}

// Activate a plan
async function activatePlan(req, res) {
  try {
    const { id } = req.params;
    const plan = await SubscriptionPlan.findByIdAndUpdate(id, { is_active: true }, { new: true });
    if (!plan) return res.status(404).json({ message: 'Plan not found' });
    return res.json({ message: 'Plan activated', plan });
  } catch (err) {
    console.error('activatePlan error', err);
    return res.status(500).json({ message: 'Internal server error', error: err.message });
  }
}

// Get a single plan by id or name
async function getPlanById(req, res) {
  try {
    const { id } = req.params;
    let plan;
    if (mongoose.Types.ObjectId.isValid(id)) plan = await SubscriptionPlan.findById(id);
    else plan = await SubscriptionPlan.findOne({ name: id });

    if (!plan) return res.status(404).json({ message: 'Plan not found' });
    return res.json({ plan });
  } catch (err) {
    console.error('getPlanById error', err);
    return res.status(500).json({ message: 'Internal server error', error: err.message });
  }
}

// Update a plan
async function updatePlan(req, res) {
  try {
    const { id } = req.params;
    const updates = req.body || {};
    if (updates.name) updates.name = updates.name.trim();

    const plan = await SubscriptionPlan.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
    if (!plan) return res.status(404).json({ message: 'Plan not found' });
    return res.json({ message: 'Plan updated', plan });
  } catch (err) {
    console.error('updatePlan error', err);
    return res.status(500).json({ message: 'Internal server error', error: err.message });
  }
}

// Delete a plan
async function deletePlan(req, res) {
  try {
    const { id } = req.params;
    const plan = await SubscriptionPlan.findByIdAndDelete(id);
    if (!plan) return res.status(404).json({ message: 'Plan not found' });
    return res.json({ message: 'Plan deleted', plan });
  } catch (err) {
    console.error('deletePlan error', err);
    return res.status(500).json({ message: 'Internal server error', error: err.message });
  }
}

module.exports = {
  createPlan,
  seedDefaultPlans,
  getAllPlans,
  getPublicPlans,
  getPlanPricing,
  deactivatePlan,
  activatePlan,
  getPlanById,
  updatePlan,
  deletePlan,
};
