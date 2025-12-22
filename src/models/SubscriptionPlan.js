const mongoose = require('mongoose');
const slugify = require('slugify');

const planSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    slug: {
      type: String,
      unique: true,
      index: true,
    },

    price: {
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
      index: true,
    },

    duration_days: {
      type: Number,
      required: true,
    },

    // ✅ NEW FIELD: number of properties allowed
    property_limit: {
      type: Number,
      required: true,
      min: 1, // at least 1 property
    },

    features: {
      type: [String],
      default: [],
    },

    is_active: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

// 🔥 Auto-generate slug
planSchema.pre('save', function (next) {
  if (!this.slug) {
    this.slug = slugify(this.name, { lower: true, strict: true });
  }
  next();
});

module.exports = mongoose.model("SubscriptionPlan", planSchema);
