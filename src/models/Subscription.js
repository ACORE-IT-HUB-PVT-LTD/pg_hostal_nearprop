const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Landlord",
      required: true,
      index: true,
    },

    plan_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubscriptionPlan",
      required: true,
    },

    plan_name: {
      type: String,
      required: true,
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
      provider: {
        type: String, // razorpay / stripe / cashfree
      },
      order_id: {
        type: String,
      },
      payment_id: {
        type: String,
      },
      payment_status: {
        type: String,
        enum: ["success", "failed", "pending"],
      },
      paid_at: {
        type: Date,
      },
    },

    cancelled_at: {
      type: Date,
    },

    metadata: {
      type: Object, // flexible extra info
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Subscription", subscriptionSchema);
