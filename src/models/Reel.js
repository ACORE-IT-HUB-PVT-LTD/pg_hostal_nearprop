/**
 * Reel Model
 * 
 * Schema for reels (video content) in the platform that can be associated with 
 * properties, rooms, or beds, and include various interaction metrics.
 * 
 * @module Reel
 */

const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');
const sanitize = require('../utils/sanitize');

/**
 * Reels Schema - Videos that landlords can upload to showcase properties
 */
const reelSchema = new mongoose.Schema({
  // Owner information
  landlordId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Landlord',
    required: true
  },
  // Reel content metadata
  title: {
    type: String,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  // Reference to related property/room/bed if applicable
  propertyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property'
  },
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room'
  },
  bedId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bed'
  },
  // Video details
  videoKey: {
    type: String,
    required: true
  },
  videoUrl: {
    type: String,
    required: true
  },
  thumbnailKey: {
    type: String
  },
  thumbnailUrl: {
    type: String
  },
  duration: {
    type: Number
  },
  // Metrics
  views: {
    type: Number,
    default: 0
  },
  // Track viewers to prevent duplicate views
  viewedBy: [{
    identifier: {
      type: String, // userId or IP or visitorId
      required: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'viewedBy.userType'
    },
    userType: {
      type: String,
      enum: ['Landlord', 'Tenant']
    },
    ip: String,
    userAgent: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  // Total likes count for quick access
  totalLikes: {
    type: Number,
    default: 0
  },
  // Like details
  likes: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'likes.userType'
    },
    userType: {
      type: String,
      enum: ['Landlord', 'Tenant']
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Total comments count for quick access
  totalComments: {
    type: Number,
    default: 0
  },
  // Comment details
  comments: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'comments.userType'
    },
    userType: {
      type: String,
      enum: ['Landlord', 'Tenant', 'Anonymous']
    },
    text: {
      type: String,
      required: true,
      trim: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Total shares count for quick access
  totalShares: {
    type: Number,
    default: 0
  },
  // Share details
  shares: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'shares.userType'
    },
    userType: {
      type: String,
      enum: ['Landlord', 'Tenant']
    },
    sharedTo: {
      type: String
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Total saves count for quick access
  totalSaves: {
    type: Number,
    default: 0
  },
  // Save details
  saves: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'saves.userType'
    },
    userType: {
      type: String,
      enum: ['Landlord', 'Tenant']
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  status: {
    type: String,
    enum: ['active', 'inactive', 'processing', 'rejected'],
    default: 'processing'
  },
  tags: [String]
}, { 
  timestamps: true,
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      // Convert _id to id
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      
      // Use the pre-calculated counters or fall back to array length
      ret.likesCount = ret.totalLikes || (sanitize.hasItems(ret.likes) ? ret.likes.length : 0);
      ret.commentsCount = ret.totalComments || (sanitize.hasItems(ret.comments) ? ret.comments.length : 0);
      ret.sharesCount = ret.totalShares || (sanitize.hasItems(ret.shares) ? ret.shares.length : 0);
      ret.savesCount = ret.totalSaves || (sanitize.hasItems(ret.saves) ? ret.saves.length : 0);
      
      return ret;
    }
  }
});

// Virtual field for calculating engagement rate
reelSchema.virtual('engagementRate').get(function() {
  const interactions = 
    (this.totalLikes || this.likes?.length || 0) + 
    (this.totalComments || this.comments?.length || 0) + 
    (this.totalShares || this.shares?.length || 0) + 
    (this.totalSaves || this.saves?.length || 0);
  
  if (interactions === 0 || this.views === 0) return 0;
  
  return this.views > 0 ? (interactions / this.views) * 100 : 0;
});

// Index for faster queries
reelSchema.index({ landlordId: 1, createdAt: -1 });
reelSchema.index({ propertyId: 1, createdAt: -1 });
reelSchema.index({ roomId: 1, createdAt: -1 });
reelSchema.index({ bedId: 1, createdAt: -1 });
reelSchema.index({ status: 1 });
reelSchema.index({ tags: 1 });
reelSchema.index({ 'likes.userId': 1 });

// Add pagination plugin
reelSchema.plugin(mongoosePaginate);

// Create model
const Reel = mongoose.model('Reel', reelSchema);

/**
 * Reel Notification Schema
 */
const reelNotificationSchema = new mongoose.Schema({
  reelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Reel',
    required: true
  },
  landlordId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Landlord',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'userType'
  },
  userType: {
    type: String,
    enum: ['Landlord', 'Tenant'],
    default: 'Tenant'
  },
  type: {
    type: String,
    enum: ['like', 'comment', 'share', 'save', 'view'],
    required: true
  },
  message: {
    type: String,
    required: true
  },
  read: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Add pagination plugin
reelNotificationSchema.plugin(mongoosePaginate);

const ReelNotification = mongoose.model('ReelNotification', reelNotificationSchema);

module.exports = {
  Reel,
  ReelNotification
};
