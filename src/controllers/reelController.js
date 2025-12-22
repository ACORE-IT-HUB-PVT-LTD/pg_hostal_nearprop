const mongoose = require('mongoose');
const { Reel, ReelNotification } = require('../models/Reel');
const Property = require('../models/Property');
const Room = require('../models/Room');
const Bed = require('../models/Bed');
const reelUploadService = require('../utils/reelUploadService');
const { redisClient } = require('../config/database');
const socketService = require('../services/socketService');
const fs = require('fs');
const path = require('path');

/**
 * Upload a new reel
 * @route POST /api/reels/upload
 */
const uploadReel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Video file is required'
      });
    }

    const { title, description, propertyId, roomId, bedId, tags } = req.body;
    const landlordId = req.user.id;
    
    // Validate if property exists and belongs to the landlord
    if (propertyId) {
      const property = await Property.findOne({ _id: propertyId, landlordId });
      if (!property) {
        return res.status(404).json({
          success: false,
          message: 'Property not found or does not belong to this landlord'
        });
      }
      
      // Validate room if provided
      if (roomId) {
        const room = await Room.findOne({ _id: roomId, propertyId });
        if (!room) {
          return res.status(404).json({
            success: false,
            message: 'Room not found or does not belong to this property'
          });
        }
        
        // Validate bed if provided
        if (bedId) {
          const bed = await Bed.findOne({ _id: bedId, roomId });
          if (!bed) {
            return res.status(404).json({
              success: false,
              message: 'Bed not found or does not belong to this room'
            });
          }
        }
      }
    }
    
    const videoPath = req.file.path;
    const videoFilename = req.file.filename;
    
    // Generate thumbnail
    let thumbnailPath;
    try {
      thumbnailPath = await reelUploadService.generateThumbnail(videoPath);
    } catch (error) {
      console.error('Error generating thumbnail:', error);
      // Continue without thumbnail if generation fails
    }
    
    // Get video duration
    let duration;
    try {
      duration = await reelUploadService.getVideoDuration(videoPath);
    } catch (error) {
      console.error('Error getting video duration:', error);
      // Continue without duration if getting duration fails
    }
    
    // Upload video to S3
    const videoUpload = await reelUploadService.uploadVideoToS3(videoPath, videoFilename);
    
    // Upload thumbnail to S3 if available
    let thumbnailUpload = null;
    if (thumbnailPath) {
      const thumbnailFilename = path.basename(thumbnailPath);
      thumbnailUpload = await reelUploadService.uploadThumbnailToS3(thumbnailPath, thumbnailFilename);
    }
    
    // Parse tags if provided
    let parsedTags = [];
    if (tags) {
      try {
        if (typeof tags === 'string') {
          // Try parsing as JSON first
          try {
            parsedTags = JSON.parse(tags);
          } catch {
            // If parsing fails, try comma separated string
            parsedTags = tags.split(',').map(tag => tag.trim());
          }
        } else if (Array.isArray(tags)) {
          parsedTags = tags;
        }
      } catch (error) {
        console.error('Error parsing tags:', error);
        // Continue without tags if parsing fails
      }
    }
    
    // Create reel document
    const reel = new Reel({
      landlordId,
      title,
      description,
      propertyId: propertyId || undefined,
      roomId: roomId || undefined,
      bedId: bedId || undefined,
      videoKey: videoUpload.key,
      videoUrl: videoUpload.url,
      thumbnailKey: thumbnailUpload ? thumbnailUpload.key : undefined,
      thumbnailUrl: thumbnailUpload ? thumbnailUpload.url : undefined,
      duration,
      status: 'active',
      tags: parsedTags
    });
    
    await reel.save();
    
    // Cleanup temporary files
    const filesToCleanup = [videoPath];
    if (thumbnailPath) {
      filesToCleanup.push(thumbnailPath);
    }
    reelUploadService.cleanupTempFiles(filesToCleanup);
    
    return res.status(201).json({
      success: true,
      message: 'Reel uploaded successfully',
      reel
    });
  } catch (error) {
    console.error('Error uploading reel:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Get all reels (with filters)
 * @route GET /api/reels
 */
const getReels = async (req, res) => {
  try {
    const { 
      propertyId, roomId, bedId, landlordId, 
      limit = 10, page = 1, sort = 'latest',
      sortBy, sortOrder
    } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build filter object
    const filter = {};
    if (propertyId) filter.propertyId = propertyId;
    if (roomId) filter.roomId = roomId;
    if (bedId) filter.bedId = bedId;
    if (landlordId) filter.landlordId = landlordId;
    filter.status = 'active';
    
    // Build sort object
    let sortOption = {};
    
    // Support for both sortBy/sortOrder format and named sorts (latest, popular, trending)
    if (sortBy && sortOrder) {
      sortOption[sortBy] = sortOrder === 'desc' ? -1 : 1;
    } else if (sort === 'latest') {
      sortOption = { createdAt: -1 };
    } else if (sort === 'popular') {
      sortOption = { views: -1 };
    } else if (sort === 'trending') {
      sortOption = { createdAt: -1, views: -1 }; // Simple trending algorithm
    } else {
      sortOption = { createdAt: -1 }; // Default to latest
    }
    
    // Get total count using Model.estimatedDocumentCount instead of countDocuments
    const totalReels = await Reel.find(filter).countDocuments();
    
    // Get reels with all the fields we need
    const reels = await Reel.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit))
      .select('title description videoKey thumbnailKey landlordId propertyId roomId bedId views status tags createdAt updatedAt')
      .populate('landlordId', 'name email mobile profilePhoto')
      .populate('propertyId', 'name address city')
      .lean(); // Use lean for better performance
    
    // Get counts for each reel separately using aggregation
    const reelIds = reels.map(reel => reel._id);
    
    const countsAgg = await Reel.aggregate([
      { $match: { _id: { $in: reelIds } } },
      { $project: {
        _id: 1,
        likesCount: { $size: { $ifNull: ["$likes", []] } },
        commentsCount: { $size: { $ifNull: ["$comments", []] } },
        sharesCount: { $size: { $ifNull: ["$shares", []] } },
        savesCount: { $size: { $ifNull: ["$saves", []] } }
      }}
    ]);
    
    // Create a map of counts by reel id
    const countsMap = {};
    countsAgg.forEach(count => {
      countsMap[count._id] = count;
    });
    
    // Create final reels array with signed URLs and counts
    const reelsWithData = reels.map(reel => {
      const counts = countsMap[reel._id] || { likesCount: 0, commentsCount: 0, sharesCount: 0, savesCount: 0 };
      
      // Generate signed URLs for videos and thumbnails
      const videoUrl = reelUploadService.getSignedUrl(reel.videoKey, 3600);
      const thumbnailUrl = reel.thumbnailKey ? 
        reelUploadService.getSignedUrl(reel.thumbnailKey, 3600) : 
        null;
      
      return {
        ...reel,
        videoUrl,
        thumbnailUrl,
        likesCount: counts.likesCount,
        commentsCount: counts.commentsCount,
        sharesCount: counts.sharesCount,
        savesCount: counts.savesCount
      };
    });
    
    return res.status(200).json({
      success: true,
      reels: reelsWithData,
      pagination: {
        totalReels,
        totalPages: Math.ceil(totalReels / parseInt(limit)),
        currentPage: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error getting reels:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Get reel by ID
 * @route GET /api/reels/:id
 */
const getReelById = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid reel ID format'
      });
    }
    
    // Find reel by ID
    const reel = await Reel.findById(id)
      .populate('landlordId', 'name email mobile profilePhoto')
      .populate('propertyId', 'name address city type');
    
    if (!reel) {
      return res.status(404).json({
        success: false,
        message: 'Reel not found'
      });
    }
    
    // Generate signed URLs for video and thumbnail
    const videoUrl = reelUploadService.getSignedUrl(reel.videoKey, 3600);
    const thumbnailUrl = reel.thumbnailKey ? 
      reelUploadService.getSignedUrl(reel.thumbnailKey, 3600) : 
      null;
    
    // Check if the user has liked the reel
    let likedByUser = false;
    if (req.user) {
      const userId = req.user.id;
      const userType = req.user.role === 'landlord' ? 'Landlord' : 'Tenant';
      
      likedByUser = reel.likes.some(like => 
        like.userId.toString() === userId && like.userType === userType
      );
    }
    
    // Increment view count
    reel.views += 1;
    await reel.save();
    
    // Add likedByUser to the response
    const reelWithSignedUrls = {
      ...reel.toJSON(),
      videoUrl,
      thumbnailUrl,
      likedByUser
    };
    
    return res.status(200).json({
      success: true,
      reel: reelWithSignedUrls
    });
  } catch (error) {
    console.error('Error getting reel by ID:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Get all reels for a landlord
 * @route GET /api/reels/landlord/all
 */
const getLandlordReels = async (req, res) => {
  try {
    const landlordId = req.user.id;
    const { limit = 10, page = 1, sort = 'latest' } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build sort object
    let sortOption = {};
    if (sort === 'latest') {
      sortOption = { createdAt: -1 };
    } else if (sort === 'popular') {
      sortOption = { views: -1 };
    } else if (sort === 'trending') {
      sortOption = { createdAt: -1, views: -1 };
    }
    
    // Get total count for pagination using find().countDocuments()
    const totalReels = await Reel.find({ landlordId }).countDocuments();
    
    // Get landlord reels
    const reels = await Reel.find({ landlordId })
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('propertyId', 'name address city type')
      .lean();
    
    // Get counts for each reel
    const reelIds = reels.map(reel => reel._id);
    
    const countsAgg = await Reel.aggregate([
      { $match: { _id: { $in: reelIds } } },
      { $project: {
        _id: 1,
        likesCount: { $size: { $ifNull: ["$likes", []] } },
        commentsCount: { $size: { $ifNull: ["$comments", []] } },
        sharesCount: { $size: { $ifNull: ["$shares", []] } },
        savesCount: { $size: { $ifNull: ["$saves", []] } }
      }}
    ]);
    
    // Create a map of counts by reel id
    const countsMap = {};
    countsAgg.forEach(count => {
      countsMap[count._id] = count;
    });
    
    // Generate signed URLs for videos and thumbnails
    const reelsWithData = reels.map(reel => {
      const counts = countsMap[reel._id] || { likesCount: 0, commentsCount: 0, sharesCount: 0, savesCount: 0 };
      
      const videoUrl = reelUploadService.getSignedUrl(reel.videoKey, 3600);
      const thumbnailUrl = reel.thumbnailKey ? 
        reelUploadService.getSignedUrl(reel.thumbnailKey, 3600) : 
        null;
      
      return {
        ...reel,
        videoUrl,
        thumbnailUrl,
        likesCount: counts.likesCount,
        commentsCount: counts.commentsCount,
        sharesCount: counts.sharesCount,
        savesCount: counts.savesCount
      };
    });
    
    return res.status(200).json({
      success: true,
      reels: reelsWithData,
      pagination: {
        totalReels,
        totalPages: Math.ceil(totalReels / parseInt(limit)),
        currentPage: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error getting landlord reels:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Get all reels for a property
 * @route GET /api/reels/property/:propertyId
 */
const getReelsByProperty = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const { limit = 10, page = 1, sort = 'latest' } = req.query;
    
    // Validate the property exists
    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }
    
    // Set up pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build sort object
    let sortOption = {};
    if (sort === 'latest') {
      sortOption = { createdAt: -1 };
    } else if (sort === 'popular') {
      sortOption = { views: -1 };
    } else if (sort === 'trending') {
      sortOption = { createdAt: -1, views: -1 };
    }
    
    // Get total count for pagination using find().countDocuments()
    const totalReels = await Reel.find({ 
      propertyId,
      status: 'active'
    }).countDocuments();
    
    // Get property reels
    const reels = await Reel.find({ 
      propertyId,
      status: 'active'
    })
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('landlordId', 'name email mobile profilePhoto')
      .lean();
    
    // Get counts for each reel
    const reelIds = reels.map(reel => reel._id);
    
    const countsAgg = await Reel.aggregate([
      { $match: { _id: { $in: reelIds } } },
      { $project: {
        _id: 1,
        likesCount: { $size: { $ifNull: ["$likes", []] } },
        commentsCount: { $size: { $ifNull: ["$comments", []] } },
        sharesCount: { $size: { $ifNull: ["$shares", []] } },
        savesCount: { $size: { $ifNull: ["$saves", []] } }
      }}
    ]);
    
    // Create a map of counts by reel id
    const countsMap = {};
    countsAgg.forEach(count => {
      countsMap[count._id] = count;
    });
    
    // Generate signed URLs for videos and thumbnails
    const reelsWithData = reels.map(reel => {
      const counts = countsMap[reel._id] || { likesCount: 0, commentsCount: 0, sharesCount: 0, savesCount: 0 };
      
      const videoUrl = reelUploadService.getSignedUrl(reel.videoKey, 3600);
      const thumbnailUrl = reel.thumbnailKey ? 
        reelUploadService.getSignedUrl(reel.thumbnailKey, 3600) : 
        null;
      
      return {
        ...reel,
        videoUrl,
        thumbnailUrl,
        likesCount: counts.likesCount,
        commentsCount: counts.commentsCount,
        sharesCount: counts.sharesCount,
        savesCount: counts.savesCount
      };
    });
    
    return res.status(200).json({
      success: true,
      property: {
        id: property._id,
        name: property.name,
        address: property.address,
        city: property.city,
        type: property.type
      },
      reels: reelsWithData,
      pagination: {
        totalReels,
        totalPages: Math.ceil(totalReels / parseInt(limit)),
        currentPage: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error getting property reels:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Export controller functions
module.exports = {
  uploadReel,
  getReels,
  getReelById,
  getLandlordReels,
  getReelsByProperty,
  // Implementing the reel interaction functions
  /**
   * Record a view for a reel without requiring authentication
   * @route POST /api/reels/:id/view
   */
  recordReelView: async (req, res) => {
    try {
      const { id } = req.params;
      const { visitorId } = req.body;
      const userId = req.user ? req.user.id : null;
      
      if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid reel ID format'
        });
      }
      
      const reel = await Reel.findById(id);
      if (!reel) {
        return res.status(404).json({
          success: false,
          message: 'Reel not found'
        });
      }
      
      // Initialize viewedBy array if it doesn't exist
      if (!reel.viewedBy) {
        reel.viewedBy = [];
      }
      
      // Check if this user/visitor has already viewed the reel
      const viewerIdentifier = userId || visitorId || req.ip;
      const alreadyViewed = reel.viewedBy.some(viewer => 
        viewer.identifier === viewerIdentifier && 
        // Only count as already viewed if viewed within last 24 hours
        (new Date() - new Date(viewer.timestamp) < 24 * 60 * 60 * 1000)
      );
      
      if (!alreadyViewed) {
        // Increment view count only if not already viewed
        reel.views = (reel.views || 0) + 1;
        
        // Add to viewedBy array
        reel.viewedBy.push({
          identifier: viewerIdentifier,
          userId: userId || null,
          ip: req.ip || req.connection.remoteAddress,
          userAgent: req.headers['user-agent'] || 'Unknown',
          timestamp: new Date()
        });
        
        // Remove old view records (older than 7 days) to prevent array growth
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        reel.viewedBy = reel.viewedBy.filter(viewer => 
          new Date(viewer.timestamp) >= oneWeekAgo
        );
        
        await reel.save();
      }
      
      // Return minimal info to avoid unnecessary data transfer
      return res.status(200).json({
        success: true,
        message: alreadyViewed ? 'View already recorded' : 'View recorded successfully',
        viewCount: reel.views,
        newView: !alreadyViewed
      });
    } catch (error) {
      console.error('Error recording view:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  },
  
  /**
   * Share a reel publicly without requiring authentication
   * @route POST /api/reels/:id/share/public
   */
  shareReelPublic: async (req, res) => {
    try {
      const { id } = req.params;
      const { platform, deviceInfo } = req.body;
      
      if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid reel ID format'
        });
      }
      
      const reel = await Reel.findById(id);
      if (!reel) {
        return res.status(404).json({
          success: false,
          message: 'Reel not found'
        });
      }
      
      // Initialize shares array if it doesn't exist
      if (!reel.shares) {
        reel.shares = [];
      }
      
      // Add anonymous share record
      const shareRecord = {
        userType: 'Anonymous',
        sharedTo: platform || 'other',
        deviceInfo: deviceInfo || 'Unknown device',
        createdAt: new Date()
      };
      
      reel.shares.push(shareRecord);
      await reel.save();
      
      // Send notification to landlord about anonymous share
      try {
        const notificationService = require('../utils/notificationService');
        const anonymousInfo = {
          deviceInfo: deviceInfo || 'Unknown device',
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.headers['user-agent'] || 'Unknown browser',
          location: req.headers['x-forwarded-for'] || 'Unknown location'
        };
        
        await notificationService.sendAnonymousInteractionNotification(
          reel.landlordId,
          reel._id,
          reel.title || 'Untitled Reel',
          'share',
          anonymousInfo,
          `Shared to ${platform || 'other'}`
        );
      } catch (notifError) {
        console.error('Error sending notification:', notifError);
        // Continue even if notification fails
      }
      
      return res.status(200).json({
        success: true,
        message: 'Reel shared successfully',
        sharesCount: reel.shares.length
      });
    } catch (error) {
      console.error('Error in shareReelPublic:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  },
  
  likeReel: async (req, res) => {
    try {
      const { id } = req.params;
      
      // We require authentication for liking now
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required to like reels'
        });
      }
      
      const userId = req.user.id;
      const userType = req.user.role === 'landlord' ? 'Landlord' : 'Tenant';
      
      const reel = await Reel.findById(id);
      if (!reel) {
        return res.status(404).json({
          success: false,
          message: 'Reel not found'
        });
      }
      
      // Initialize likes array if it doesn't exist
      if (!reel.likes) {
        reel.likes = [];
      }
      
      // Check if user has already liked the reel
      const existingLikeIndex = reel.likes.findIndex(like => 
        like.userId && 
        like.userId.toString() === userId && 
        like.userType === userType
      );
      
      const alreadyLiked = existingLikeIndex !== -1;
      
      if (alreadyLiked) {
        // If already liked, unlike it (toggle behavior)
        reel.likes.splice(existingLikeIndex, 1);
        // Decrement total like count
        reel.totalLikes = (reel.totalLikes || reel.likes.length + 1) - 1;
        await reel.save();
        
        return res.status(200).json({
          success: true,
          message: 'Reel unliked successfully',
          liked: false,
          likesCount: reel.totalLikes
        });
      } else {
        // Add user to likes array
        reel.likes.push({
          userId,
          userType,
          createdAt: new Date()
        });
        
        // Increment total like count
        reel.totalLikes = (reel.totalLikes || reel.likes.length - 1) + 1;
        await reel.save();
        
        // Get user information for notification
        const Tenant = require('../models/Tenant');
        const Landlord = require('../models/Landlord');
        
        let user;
        if (userType === 'Tenant') {
          user = await Tenant.findById(userId).select('name mobile email profilePhoto');
        } else {
          user = await Landlord.findById(userId).select('name mobile email profilePhoto');
        }
        
        // Send notification to landlord (only if the liker is not the landlord themselves)
        if (user && userId !== reel.landlordId.toString()) {
          const notificationService = require('../utils/notificationService');
          await notificationService.sendLikeNotification(
            reel.landlordId,
            reel._id,
            user,
            reel.title || 'Untitled Reel'
          );
        }
        
        return res.status(200).json({
          success: true,
          message: 'Reel liked successfully',
          liked: true,
          likesCount: reel.totalLikes
        });
      }
    } catch (error) {
      console.error('Error in likeReel:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  },
  commentOnReel: async (req, res) => {
    try {
      const { id } = req.params;
      const { text } = req.body;
      
      // Authentication is required for comments now
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required to comment on reels'
        });
      }
      
      const userId = req.user.id;
      const userType = req.user.role === 'landlord' ? 'Landlord' : 'Tenant';
      
      // Validate comment text
      if (!text || text.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'Comment text is required'
        });
      }
      
      const reel = await Reel.findById(id);
      if (!reel) {
        return res.status(404).json({
          success: false,
          message: 'Reel not found'
        });
      }
      
      // Initialize comments array if it doesn't exist
      if (!reel.comments) {
        reel.comments = [];
      }
      
      // Add comment
      const newComment = {
        userId,
        userType,
        text: text.trim(),
        createdAt: new Date()
      };
      
      reel.comments.push(newComment);
      
      // Increment comment count
      reel.totalComments = (reel.totalComments || reel.comments.length - 1) + 1;
      await reel.save();
      
      // Get user information for notification
      let user;
      if (userType === 'Tenant') {
        const Tenant = require('../models/Tenant');
        user = await Tenant.findById(userId).select('name mobile email profilePhoto');
      } else {
        const Landlord = require('../models/Landlord');
        user = await Landlord.findById(userId).select('name mobile email profilePhoto');
      }
      
      // Send notification to landlord (only if the commenter is not the landlord themselves)
      if (user && userId !== reel.landlordId.toString()) {
        const notificationService = require('../utils/notificationService');
        await notificationService.sendCommentNotification(
          reel.landlordId,
          reel._id,
          user,
          text.trim(),
          reel.title || 'Untitled Reel'
        );
      }
      
      return res.status(201).json({
        success: true,
        message: 'Comment added successfully',
        comment: {
          ...newComment,
          id: newComment._id,
          userName: user ? user.name : 'Unknown User',
          userPhoto: user ? user.profilePhoto : null
        },
        commentsCount: reel.totalComments
      });
    } catch (error) {
      console.error('Error in commentOnReel:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  },
  
  commentOnReelPublic: async (req, res) => {
    try {
      const { id } = req.params;
      const { text, visitorName, visitorEmail, visitorMobile } = req.body;
      
      // Validate comment text
      if (!text || text.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'Comment text is required'
        });
      }
      
      const reel = await Reel.findById(id);
      if (!reel) {
        return res.status(404).json({
          success: false,
          message: 'Reel not found'
        });
      }
      
      // Initialize comments array if it doesn't exist
      if (!reel.comments) {
        reel.comments = [];
      }
      
      // Add anonymous comment with optional visitor info
      const newComment = {
        userType: 'Anonymous',
        text: text.trim(),
        visitorInfo: {
          name: visitorName || 'Anonymous User',
          email: visitorEmail || null,
          mobile: visitorMobile || null,
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.headers['user-agent'] || 'Unknown browser'
        },
        createdAt: new Date()
      };
      
      reel.comments.push(newComment);
      await reel.save();
      
      // Prepare visitor info for notification
      const anonymousInfo = {
        name: visitorName || 'Anonymous User',
        email: visitorEmail || null,
        mobile: visitorMobile || null,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'] || 'Unknown browser',
        location: req.headers['x-forwarded-for'] || 'Unknown location'
      };
      
      // Send notification to landlord about anonymous comment
      try {
        const notificationService = require('../utils/notificationService');
        await notificationService.sendAnonymousInteractionNotification(
          reel.landlordId,
          reel._id,
          reel.title || 'Untitled Reel',
          'comment',
          anonymousInfo,
          text.trim()
        );
      } catch (notifError) {
        console.error('Error sending anonymous comment notification:', notifError);
        // Continue even if notification fails
      }
      
      return res.status(201).json({
        success: true,
        message: 'Anonymous comment added successfully',
        comment: {
          ...newComment,
          id: newComment._id
        },
        commentsCount: reel.comments.length
      });
    } catch (error) {
      console.error('Error in commentOnReelPublic:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  },
  shareReel: async (req, res) => {
    try {
      const { id } = req.params;
      const { platform } = req.body;
      
      // Authentication is required for sharing now
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required to share reels'
        });
      }
      
      const userId = req.user.id;
      const userType = req.user.role === 'landlord' ? 'Landlord' : 'Tenant';
      
      const reel = await Reel.findById(id);
      if (!reel) {
        return res.status(404).json({
          success: false,
          message: 'Reel not found'
        });
      }
      
      // Initialize shares array if it doesn't exist
      if (!reel.shares) {
        reel.shares = [];
      }
      
      // Add share record
      const shareRecord = {
        userId,
        userType,
        sharedTo: platform || 'other',
        createdAt: new Date()
      };
      
      reel.shares.push(shareRecord);
      
      // Increment total shares count
      reel.totalShares = (reel.totalShares || 0) + 1;
      await reel.save();
      
      // Get user information for notification
      let user;
      if (userType === 'Tenant') {
        const Tenant = require('../models/Tenant');
        user = await Tenant.findById(userId).select('name mobile email profilePhoto');
      } else {
        const Landlord = require('../models/Landlord');
        user = await Landlord.findById(userId).select('name mobile email profilePhoto');
      }
      
      // Send notification to landlord (only if the sharer is not the landlord themselves)
      if (user && userId !== reel.landlordId.toString()) {
        const notificationService = require('../utils/notificationService');
        await notificationService.sendShareNotification(
          reel.landlordId,
          reel._id,
          user,
          platform || 'other',
          reel.title || 'Untitled Reel'
        );
      }
      
      return res.status(200).json({
        success: true,
        message: 'Reel shared successfully',
        sharesCount: reel.totalShares
      });
    } catch (error) {
      console.error('Error in shareReel:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  },
  saveReel: async (req, res) => {
    try {
      const { id } = req.params;
      
      // Authentication is required for saving now
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required to save reels'
        });
      }
      
      const userId = req.user.id;
      const userType = req.user.role === 'landlord' ? 'Landlord' : 'Tenant';
      
      const reel = await Reel.findById(id);
      if (!reel) {
        return res.status(404).json({
          success: false,
          message: 'Reel not found'
        });
      }
      
      // Initialize saves array if it doesn't exist
      if (!reel.saves) {
        reel.saves = [];
      }
      
      // Check if user has already saved the reel
      const existingSaveIndex = reel.saves.findIndex(save => 
        save.userId && 
        save.userId.toString() === userId && 
        save.userType === userType
      );
      
      const alreadySaved = existingSaveIndex !== -1;
      
      if (alreadySaved) {
        // If already saved, unsave it (toggle behavior)
        reel.saves.splice(existingSaveIndex, 1);
        // Decrement total saves count
        reel.totalSaves = (reel.totalSaves || reel.saves.length + 1) - 1;
        await reel.save();
        
        return res.status(200).json({
          success: true,
          message: 'Reel unsaved successfully',
          saved: false,
          savesCount: reel.totalSaves
        });
      } else {
        // Add user to saves array
        reel.saves.push({
          userId,
          userType,
          createdAt: new Date()
        });
        
        // Increment total saves count
        reel.totalSaves = (reel.totalSaves || reel.saves.length - 1) + 1;
        await reel.save();
        
        // Get user information for notification
        let user;
        if (userType === 'Tenant') {
          const Tenant = require('../models/Tenant');
          user = await Tenant.findById(userId).select('name mobile email profilePhoto');
        } else {
          const Landlord = require('../models/Landlord');
          user = await Landlord.findById(userId).select('name mobile email profilePhoto');
        }
        
        // Send notification to landlord (only if the saver is not the landlord themselves)
        if (user && userId !== reel.landlordId.toString()) {
          const notificationService = require('../utils/notificationService');
          await notificationService.sendSaveNotification(
            reel.landlordId,
            reel._id,
            user,
            reel.title || 'Untitled Reel'
          );
        }
        
        return res.status(200).json({
          success: true,
          message: 'Reel saved successfully',
          saved: true,
          savesCount: reel.totalSaves
        });
      }
    } catch (error) {
      console.error('Error in saveReel:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  },
  
  saveReelPublic: async (req, res) => {
    try {
      const { id } = req.params;
      const { visitorName, visitorEmail, visitorMobile, deviceInfo } = req.body;
      
      const reel = await Reel.findById(id);
      if (!reel) {
        return res.status(404).json({
          success: false,
          message: 'Reel not found'
        });
      }
      
      // Initialize anonymous saves array if it doesn't exist
      if (!reel.anonymousSaves) {
        reel.anonymousSaves = [];
      }
      
      // Add anonymous save record with optional visitor info
      const anonymousSave = {
        visitorInfo: {
          name: visitorName || 'Anonymous User',
          email: visitorEmail || null,
          mobile: visitorMobile || null,
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.headers['user-agent'] || 'Unknown browser',
          deviceInfo: deviceInfo || 'Unknown device'
        },
        createdAt: new Date()
      };
      
      reel.anonymousSaves.push(anonymousSave);
      await reel.save();
      
      // Prepare visitor info for notification
      const anonymousInfo = {
        name: visitorName || 'Anonymous User',
        email: visitorEmail || null,
        mobile: visitorMobile || null,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'] || 'Unknown browser',
        location: req.headers['x-forwarded-for'] || 'Unknown location',
        deviceInfo: deviceInfo || 'Unknown device'
      };
      
      // Send notification to landlord about anonymous save
      try {
        const notificationService = require('../utils/notificationService');
        await notificationService.sendAnonymousInteractionNotification(
          reel.landlordId,
          reel._id,
          reel.title || 'Untitled Reel',
          'save',
          anonymousInfo
        );
      } catch (notifError) {
        console.error('Error sending anonymous save notification:', notifError);
        // Continue even if notification fails
      }
      
      return res.status(200).json({
        success: true,
        message: 'Reel saved anonymously',
        savesCount: (reel.saves ? reel.saves.length : 0) + reel.anonymousSaves.length
      });
    } catch (error) {
      console.error('Error in saveReelPublic:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  },
  
  getSavedReels: async (req, res) => {
    try {
      const userId = req.user.id;
      const userType = req.user.role === 'landlord' ? 'Landlord' : 'Tenant';
      const { limit = 10, page = 1 } = req.query;
      
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      // Find reels saved by this user
      const reels = await Reel.find({
        'saves.userId': userId,
        'saves.userType': userType,
        status: 'active'
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('landlordId', 'name email mobile profilePhoto')
        .populate('propertyId', 'name address city')
        .lean();
      
      const totalReels = await Reel.countDocuments({
        'saves.userId': userId,
        'saves.userType': userType,
        status: 'active'
      });
      
      // Get counts for each reel
      const reelIds = reels.map(reel => reel._id);
      
      const countsAgg = await Reel.aggregate([
        { $match: { _id: { $in: reelIds } } },
        { $project: {
          _id: 1,
          likesCount: { $size: { $ifNull: ["$likes", []] } },
          commentsCount: { $size: { $ifNull: ["$comments", []] } },
          sharesCount: { $size: { $ifNull: ["$shares", []] } },
          savesCount: { $size: { $ifNull: ["$saves", []] } }
        }}
      ]);
      
      // Create a map of counts by reel id
      const countsMap = {};
      countsAgg.forEach(count => {
        countsMap[count._id] = count;
      });
      
      // Create final reels array with signed URLs and counts
      const reelsWithData = reels.map(reel => {
        const counts = countsMap[reel._id] || { likesCount: 0, commentsCount: 0, sharesCount: 0, savesCount: 0 };
        
        // Generate signed URLs for videos and thumbnails
        const videoUrl = reelUploadService.getSignedUrl(reel.videoKey, 3600);
        const thumbnailUrl = reel.thumbnailKey ? 
          reelUploadService.getSignedUrl(reel.thumbnailKey, 3600) : 
          null;
        
        return {
          ...reel,
          videoUrl,
          thumbnailUrl,
          likesCount: counts.likesCount,
          commentsCount: counts.commentsCount,
          sharesCount: counts.sharesCount,
          savesCount: counts.savesCount,
          // Flag to indicate this reel is saved by the user
          saved: true
        };
      });
      
      return res.status(200).json({
        success: true,
        reels: reelsWithData,
        pagination: {
          totalReels,
          totalPages: Math.ceil(totalReels / parseInt(limit)),
          currentPage: parseInt(page),
          limit: parseInt(limit)
        }
      });
    } catch (error) {
      console.error('Error in getSavedReels:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  },
  /**
   * Get all notifications for a landlord
   * @route GET /api/reels/landlord/notifications
   */
  getReelNotifications: async (req, res) => {
    try {
      const landlordId = req.user.id;
      const { page = 1, limit = 20, unreadOnly = false } = req.query;
      
      // Build query
      const query = { landlordId };
      if (unreadOnly === 'true' || unreadOnly === true) {
        query.read = false;
      }
      
      // Get notifications with regular find() since we might have pagination issues
      try {
        // Try paginate first
        const options = {
          page: parseInt(page),
          limit: parseInt(limit),
          sort: { createdAt: -1 },
          populate: {
            path: 'reelId',
            select: 'title videoKey thumbnailKey'
          }
        };
        
        const notifications = await ReelNotification.paginate(query, options);
        
        // Add signed URLs to the notifications with reels
        const notificationsWithUrls = notifications.docs.map(notification => {
          const notificationObj = notification.toObject ? notification.toObject() : notification;
          
          // Add signed URLs if reelId exists and has videoKey
          if (notificationObj.reelId && notificationObj.reelId.videoKey) {
            notificationObj.reelId.videoUrl = reelUploadService.getSignedUrl(
              notificationObj.reelId.videoKey, 
              3600
            );
            
            if (notificationObj.reelId.thumbnailKey) {
              notificationObj.reelId.thumbnailUrl = reelUploadService.getSignedUrl(
                notificationObj.reelId.thumbnailKey,
                3600
              );
            }
          }
          
          return notificationObj;
        });
        
        // Count unread notifications
        const unreadCount = await ReelNotification.countDocuments({
          landlordId,
          read: false
        });
        
        return res.status(200).json({
          success: true,
          notifications: notificationsWithUrls,
          pagination: {
            totalNotifications: notifications.totalDocs,
            totalPages: notifications.totalPages,
            currentPage: notifications.page,
            limit: notifications.limit
          },
          unreadCount
        });
      } catch (paginateError) {
        console.error('Error with paginate, falling back to regular query:', paginateError);
        
        // Fallback to regular query if paginate fails
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const notifications = await ReelNotification.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .populate({
            path: 'reelId',
            select: 'title videoKey thumbnailKey'
          })
          .lean();
        
        // Add signed URLs to the notifications with reels
        const notificationsWithUrls = notifications.map(notification => {
          // Add signed URLs if reelId exists and has videoKey
          if (notification.reelId && notification.reelId.videoKey) {
            notification.reelId.videoUrl = reelUploadService.getSignedUrl(
              notification.reelId.videoKey, 
              3600
            );
            
            if (notification.reelId.thumbnailKey) {
              notification.reelId.thumbnailUrl = reelUploadService.getSignedUrl(
                notification.reelId.thumbnailKey,
                3600
              );
            }
          }
          
          return notification;
        });
        
        // Count total notifications for pagination
        const totalNotifications = await ReelNotification.countDocuments(query);
        
        // Count unread notifications
        const unreadCount = await ReelNotification.countDocuments({
          landlordId,
          read: false
        });
        
        return res.status(200).json({
          success: true,
          notifications: notificationsWithUrls,
          pagination: {
            totalNotifications,
            totalPages: Math.ceil(totalNotifications / parseInt(limit)),
            currentPage: parseInt(page),
            limit: parseInt(limit)
          },
          unreadCount
        });
      }
    } catch (error) {
      console.error('Error getting notifications:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  },
  
  /**
   * Mark notifications as read
   * @route PUT /api/reels/landlord/notifications/mark-read
   */
  markNotificationsAsRead: async (req, res) => {
    try {
      const landlordId = req.user.id;
      const { notificationIds } = req.body;
      
      try {
        if (!notificationIds || !Array.isArray(notificationIds)) {
          // If no specific IDs are provided, mark all as read
          const result = await ReelNotification.updateMany(
            { landlordId, read: false },
            { $set: { read: true } }
          );
          
          console.log(`Marked ${result.modifiedCount} notifications as read`);
          
          return res.status(200).json({
            success: true,
            message: 'All notifications marked as read',
            count: result.modifiedCount
          });
        }
        
        // Mark specific notifications as read
        const result = await ReelNotification.updateMany(
          { 
            _id: { $in: notificationIds },
            landlordId // Security: ensure the notifications belong to this landlord
          },
          { $set: { read: true } }
        );
        
        console.log(`Marked ${result.modifiedCount} notifications as read`);
      } catch (updateError) {
        console.error('Error updating notifications:', updateError);
        // Try alternative update approach if there's an error
        if (!notificationIds || !Array.isArray(notificationIds)) {
          await ReelNotification.updateMany(
            { landlordId, read: false },
            { read: true }
          );
        } else {
          await ReelNotification.updateMany(
            { 
              _id: { $in: notificationIds },
              landlordId
            },
            { read: true }
          );
        }
      }
      
      return res.status(200).json({
        success: true,
        message: 'Notifications marked as read'
      });
    } catch (error) {
      console.error('Error marking notifications as read:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  },
  /**
   * Get analytics for a landlord's reels
   * @route GET /api/reels/landlord/analytics
   */
  getReelAnalytics: async (req, res) => {
    try {
      const landlordId = req.user.id;
      const { timeframe = 'all' } = req.query; // all, week, month
      
      // Build date filter based on timeframe
      const dateFilter = {};
      const now = new Date();
      
      if (timeframe === 'week') {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(now.getDate() - 7);
        dateFilter.createdAt = { $gte: oneWeekAgo };
      } else if (timeframe === 'month') {
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(now.getMonth() - 1);
        dateFilter.createdAt = { $gte: oneMonthAgo };
      }
      
      // Find all reels for this landlord with the date filter
      const reels = await Reel.find({
        landlordId,
        ...dateFilter
      }).lean();
      
      // Calculate total metrics
      const totalReels = reels.length;
      let totalViews = 0;
      let totalLikes = 0;
      let totalComments = 0;
      let totalShares = 0;
      let totalSaves = 0;
      
      reels.forEach(reel => {
        totalViews += reel.views || 0;
        totalLikes += reel.likes ? reel.likes.length : 0;
        totalComments += reel.comments ? reel.comments.length : 0;
        totalShares += reel.shares ? reel.shares.length : 0;
        totalSaves += reel.saves ? reel.saves.length : 0;
      });
      
      // Calculate engagement rate
      const totalInteractions = totalLikes + totalComments + totalShares + totalSaves;
      const engagementRate = totalViews > 0 ? 
        Math.round((totalInteractions / totalViews) * 100) : 0;
      
      // Get daily metrics for the past 7 days
      const dailyMetrics = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);
        
        const nextDate = new Date(date);
        nextDate.setDate(date.getDate() + 1);
        
        // Aggregate metrics for this day
        const dailyViews = await this._getDailyViewCount(landlordId, date, nextDate);
        const dailyLikes = await this._getDailyLikeCount(landlordId, date, nextDate);
        const dailyComments = await this._getDailyCommentCount(landlordId, date, nextDate);
        const dailyShares = await this._getDailyShareCount(landlordId, date, nextDate);
        const dailySaves = await this._getDailySaveCount(landlordId, date, nextDate);
        
        dailyMetrics.push({
          date: date.toISOString().split('T')[0], // Format as YYYY-MM-DD
          views: dailyViews,
          likes: dailyLikes,
          comments: dailyComments,
          shares: dailyShares,
          saves: dailySaves
        });
      }
      
      // Get top performing reels (limit to top 5)
      const topReels = reels
        .map(reel => ({
          id: reel._id,
          title: reel.title || 'Untitled Reel',
          views: reel.views || 0,
          likes: reel.likes ? reel.likes.length : 0,
          comments: reel.comments ? reel.comments.length : 0,
          engagementRate: reel.views > 0 ? 
            Math.round(((reel.likes ? reel.likes.length : 0) + 
                        (reel.comments ? reel.comments.length : 0) + 
                        (reel.shares ? reel.shares.length : 0) + 
                        (reel.saves ? reel.saves.length : 0)) / reel.views * 100) : 0,
          createdAt: reel.createdAt
        }))
        .sort((a, b) => b.engagementRate - a.engagementRate) // Sort by engagement rate
        .slice(0, 5); // Get top 5
      
      return res.status(200).json({
        success: true,
        analytics: {
          totalReels,
          totalViews,
          totalLikes,
          totalComments,
          totalShares,
          totalSaves,
          engagementRate,
          dailyMetrics,
          topReels
        }
      });
    } catch (error) {
      console.error('Error getting reel analytics:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  },
  
  // Helper methods for analytics
  _getDailyViewCount: async (landlordId, startDate, endDate) => {
    // This would typically use an analytics collection or event tracking
    // For now, we'll simulate this using the reel creation dates
    const reels = await Reel.find({
      landlordId,
      createdAt: { $gte: startDate, $lt: endDate }
    });
    
    return reels.reduce((total, reel) => total + (reel.views || 0), 0);
  },
  
  _getDailyLikeCount: async (landlordId, startDate, endDate) => {
    const reels = await Reel.find({
      landlordId,
      'likes.createdAt': { $gte: startDate, $lt: endDate }
    });
    
    return reels.reduce((total, reel) => {
      const dailyLikes = reel.likes ? 
        reel.likes.filter(like => 
          like.createdAt >= startDate && like.createdAt < endDate
        ).length : 0;
      
      return total + dailyLikes;
    }, 0);
  },
  
  _getDailyCommentCount: async (landlordId, startDate, endDate) => {
    const reels = await Reel.find({
      landlordId,
      'comments.createdAt': { $gte: startDate, $lt: endDate }
    });
    
    return reels.reduce((total, reel) => {
      const dailyComments = reel.comments ? 
        reel.comments.filter(comment => 
          comment.createdAt >= startDate && comment.createdAt < endDate
        ).length : 0;
      
      return total + dailyComments;
    }, 0);
  },
  
  _getDailyShareCount: async (landlordId, startDate, endDate) => {
    const reels = await Reel.find({
      landlordId,
      'shares.createdAt': { $gte: startDate, $lt: endDate }
    });
    
    return reels.reduce((total, reel) => {
      const dailyShares = reel.shares ? 
        reel.shares.filter(share => 
          share.createdAt >= startDate && share.createdAt < endDate
        ).length : 0;
      
      return total + dailyShares;
    }, 0);
  },
  
  _getDailySaveCount: async (landlordId, startDate, endDate) => {
    const reels = await Reel.find({
      landlordId,
      'saves.createdAt': { $gte: startDate, $lt: endDate }
    });
    
    return reels.reduce((total, reel) => {
      const dailySaves = reel.saves ? 
        reel.saves.filter(save => 
          save.createdAt >= startDate && save.createdAt < endDate
        ).length : 0;
      
      return total + dailySaves;
    }, 0);
  },
  /**
   * Get all interactions for a specific reel
   * @route GET /api/reels/:id/interactions
   */
  getReelInteractions: async (req, res) => {
    try {
      const { id } = req.params;
      const { type } = req.query; // Optional: filter by interaction type (likes, comments, shares, saves)
      
      const reel = await Reel.findById(id);
      if (!reel) {
        return res.status(404).json({
          success: false,
          message: 'Reel not found'
        });
      }
      
      // Check if user is authorized (either the landlord who owns the reel or admin)
      if (req.user.role === 'landlord' && req.user.id !== reel.landlordId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to view these interactions'
        });
      }
      
      // Prepare response object with all interactions
      const interactions = {};
      
      // If no specific type is requested or type is 'likes'
      if (!type || type === 'likes') {
        // Populate user information for likes
        const likesWithUserInfo = [];
        
        for (const like of reel.likes || []) {
          try {
            let userModel;
            if (like.userType === 'Tenant') {
              userModel = require('../models/Tenant');
            } else {
              userModel = require('../models/Landlord');
            }
            
            const user = await userModel.findById(like.userId)
              .select('name email mobile profilePhoto')
              .lean();
            
            if (user) {
              likesWithUserInfo.push({
                user: {
                  id: user._id,
                  name: user.name,
                  email: user.email,
                  mobile: user.mobile,
                  profilePhoto: user.profilePhoto
                },
                userType: like.userType,
                createdAt: like.createdAt
              });
            }
          } catch (error) {
            console.error(`Error fetching user info for like ${like._id}:`, error);
          }
        }
        
        interactions.likes = likesWithUserInfo;
      }
      
      // If no specific type is requested or type is 'comments'
      if (!type || type === 'comments') {
        // Populate user information for comments
        const commentsWithUserInfo = [];
        
        for (const comment of reel.comments || []) {
          try {
            let userModel;
            if (comment.userType === 'Tenant') {
              userModel = require('../models/Tenant');
            } else {
              userModel = require('../models/Landlord');
            }
            
            const user = await userModel.findById(comment.userId)
              .select('name email mobile profilePhoto')
              .lean();
            
            if (user) {
              commentsWithUserInfo.push({
                id: comment._id,
                text: comment.text,
                user: {
                  id: user._id,
                  name: user.name,
                  email: user.email,
                  mobile: user.mobile,
                  profilePhoto: user.profilePhoto
                },
                userType: comment.userType,
                createdAt: comment.createdAt
              });
            }
          } catch (error) {
            console.error(`Error fetching user info for comment ${comment._id}:`, error);
          }
        }
        
        interactions.comments = commentsWithUserInfo;
      }
      
      // If no specific type is requested or type is 'shares'
      if (!type || type === 'shares') {
        // Populate user information for shares
        const sharesWithUserInfo = [];
        
        for (const share of reel.shares || []) {
          try {
            let userModel;
            if (share.userType === 'Tenant') {
              userModel = require('../models/Tenant');
            } else {
              userModel = require('../models/Landlord');
            }
            
            const user = await userModel.findById(share.userId)
              .select('name email mobile profilePhoto')
              .lean();
            
            if (user) {
              sharesWithUserInfo.push({
                platform: share.sharedTo,
                user: {
                  id: user._id,
                  name: user.name,
                  email: user.email,
                  mobile: user.mobile,
                  profilePhoto: user.profilePhoto
                },
                userType: share.userType,
                createdAt: share.createdAt
              });
            }
          } catch (error) {
            console.error(`Error fetching user info for share:`, error);
          }
        }
        
        interactions.shares = sharesWithUserInfo;
      }
      
      // If no specific type is requested or type is 'saves'
      if (!type || type === 'saves') {
        // Populate user information for saves
        const savesWithUserInfo = [];
        
        for (const save of reel.saves || []) {
          try {
            let userModel;
            if (save.userType === 'Tenant') {
              userModel = require('../models/Tenant');
            } else {
              userModel = require('../models/Landlord');
            }
            
            const user = await userModel.findById(save.userId)
              .select('name email mobile profilePhoto')
              .lean();
            
            if (user) {
              savesWithUserInfo.push({
                user: {
                  id: user._id,
                  name: user.name,
                  email: user.email,
                  mobile: user.mobile,
                  profilePhoto: user.profilePhoto
                },
                userType: save.userType,
                createdAt: save.createdAt
              });
            }
          } catch (error) {
            console.error(`Error fetching user info for save:`, error);
          }
        }
        
        interactions.saves = savesWithUserInfo;
      }
      
      return res.status(200).json({
        success: true,
        reelId: reel._id,
        reelTitle: reel.title || 'Untitled Reel',
        interactions
      });
    } catch (error) {
      console.error('Error getting reel interactions:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  },
  /**
   * Delete a reel
   * @route DELETE /api/reels/:id
   */
  deleteReel: async (req, res) => {
    try {
      const { id } = req.params;
      const landlordId = req.user.id;
      
      // Find the reel
      const reel = await Reel.findById(id);
      
      if (!reel) {
        return res.status(404).json({
          success: false,
          message: 'Reel not found'
        });
      }
      
      // Check if the user is the owner of the reel
      if (reel.landlordId.toString() !== landlordId) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to delete this reel'
        });
      }
      
      // Delete the reel's video and thumbnail from S3
      try {
        if (reel.videoKey) {
          await reelUploadService.deleteFromS3(reel.videoKey);
        }
        
        if (reel.thumbnailKey) {
          await reelUploadService.deleteFromS3(reel.thumbnailKey);
        }
      } catch (deleteError) {
        console.error('Error deleting reel files from S3:', deleteError);
        // Continue with deletion even if S3 deletion fails
      }
      
      // Delete all notifications related to this reel
      await ReelNotification.deleteMany({ reelId: id });
      
      // Delete the reel from database
      await Reel.deleteOne({ _id: id });
      
      return res.status(200).json({
        success: true,
        message: 'Reel deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting reel:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  },
  
  /**
   * Get all anonymous interactions with landlord's reels
   * @route GET /api/reels/landlord/anonymous-interactions
   */
  getAnonymousInteractions: async (req, res) => {
    try {
      const landlordId = req.user.id;
      const { type, limit = 50, page = 1 } = req.query;
      
      // Find all reels by this landlord
      const reels = await Reel.find({ landlordId });
      
      if (!reels || reels.length === 0) {
        return res.status(200).json({
          success: true,
          message: 'No reels found for this landlord',
          interactions: []
        });
      }
      
      // Aggregate all anonymous interactions
      let allInteractions = [];
      
      // Process all reels
      reels.forEach(reel => {
        const reelTitle = reel.title || 'Untitled Reel';
        const reelId = reel._id;
        
        // Anonymous likes
        if (reel.anonymousLikeDetails && reel.anonymousLikeDetails.length > 0) {
          reel.anonymousLikeDetails.forEach(like => {
            allInteractions.push({
              reelId,
              reelTitle,
              type: 'like',
              visitorInfo: like,
              createdAt: like.timestamp || new Date(),
              thumbnailUrl: reel.thumbnailUrl
            });
          });
        }
        
        // Anonymous comments
        if (reel.comments) {
          const anonymousComments = reel.comments.filter(comment => comment.userType === 'Anonymous');
          anonymousComments.forEach(comment => {
            allInteractions.push({
              reelId,
              reelTitle,
              type: 'comment',
              visitorInfo: comment.visitorInfo || {},
              text: comment.text,
              createdAt: comment.createdAt,
              thumbnailUrl: reel.thumbnailUrl
            });
          });
        }
        
        // Anonymous shares
        if (reel.shares) {
          const anonymousShares = reel.shares.filter(share => share.userType === 'Anonymous');
          anonymousShares.forEach(share => {
            allInteractions.push({
              reelId,
              reelTitle,
              type: 'share',
              visitorInfo: {
                deviceInfo: share.deviceInfo || 'Unknown device'
              },
              sharedTo: share.sharedTo,
              createdAt: share.createdAt,
              thumbnailUrl: reel.thumbnailUrl
            });
          });
        }
        
        // Anonymous saves
        if (reel.anonymousSaves && reel.anonymousSaves.length > 0) {
          reel.anonymousSaves.forEach(save => {
            allInteractions.push({
              reelId,
              reelTitle,
              type: 'save',
              visitorInfo: save.visitorInfo || {},
              createdAt: save.createdAt,
              thumbnailUrl: reel.thumbnailUrl
            });
          });
        }
      });
      
      // Sort by date (most recent first)
      allInteractions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      // Filter by type if requested
      if (type && ['like', 'comment', 'share', 'save'].includes(type)) {
        allInteractions = allInteractions.filter(interaction => interaction.type === type);
      }
      
      // Paginate results
      const startIndex = (page - 1) * limit;
      const endIndex = page * limit;
      const paginatedInteractions = allInteractions.slice(startIndex, endIndex);
      
      // Return the interactions
      return res.status(200).json({
        success: true,
        count: allInteractions.length,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(allInteractions.length / limit),
        interactions: paginatedInteractions
      });
    } catch (error) {
      console.error('Error in getAnonymousInteractions:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  }
};
