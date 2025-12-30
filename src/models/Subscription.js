const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema(
  {
    landlordId: { type: mongoose.Schema.Types.ObjectId, ref: 'Landlord', required: true },
    plan_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubscriptionPlan",
      required: true,
    },

    plan_name: {
      type: String,
      required: true,
    },

    // 💡 IMPORTANT
    property_limit: {
      type: Number,
      default: 0,
    },

    amount: {
      type: Number,
      required: true,
    },

    currency: {
      type: String,
      default: "INR",
    },

    billing_cycle: {
      type: String,
      enum: ["monthly", "quarterly", "yearly"],
      required: true,
    },

    start_date: {
      type: Date,
      required: true,
    },

    end_date: {
      type: Date,
      required: true,
    },

    status: {
      type: String,
      enum: ["active", "expired", "cancelled", "pending"],
      default: "pending",
      index: true,
    },

    auto_renew: {
      type: Boolean,
      default: false,
    },

    payment: {
      provider: String,
      order_id: String,
      payment_id: String,
      payment_status: {
        type: String,
        enum: ["success", "failed", "pending"],
      },
      paid_at: Date,
    },

    // ✅ Track all top-ups / renewals
    payment_history: [
      {
        plan_id: mongoose.Schema.Types.ObjectId,
        plan_name: String,
        amount: Number,
        billing_cycle: String,
        paid_at: Date,
        payment: Object,
      },
    ],

    cancelled_at: Date,

    metadata: Object,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Subscription", subscriptionSchema);
