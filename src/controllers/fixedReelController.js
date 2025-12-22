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
    
    // Get total count for pagination
    const totalReels = await Reel.countDocuments(filter);
    
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
    
    // Get total count for pagination
    const totalReels = await Reel.countDocuments({ landlordId });
    
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
    
    // Get total count for pagination
    const totalReels = await Reel.countDocuments({ 
      propertyId,
      status: 'active'
    });
    
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
  // These functions aren't implemented yet, you may need to add them
  // They're here as placeholders to prevent errors if routes are already referencing them
  likeReel: (req, res) => res.status(501).json({ message: "Not implemented yet" }),
  commentOnReel: (req, res) => res.status(501).json({ message: "Not implemented yet" }),
  shareReel: (req, res) => res.status(501).json({ message: "Not implemented yet" }),
  saveReel: (req, res) => res.status(501).json({ message: "Not implemented yet" }),
  getSavedReels: (req, res) => res.status(501).json({ message: "Not implemented yet" }),
  getReelNotifications: (req, res) => res.status(501).json({ message: "Not implemented yet" }),
  markNotificationsAsRead: (req, res) => res.status(501).json({ message: "Not implemented yet" }),
  getReelAnalytics: (req, res) => res.status(501).json({ message: "Not implemented yet" }),
  getReelInteractions: (req, res) => res.status(501).json({ message: "Not implemented yet" }),
  deleteReel: (req, res) => res.status(501).json({ message: "Not implemented yet" })
};
