const reelsController = require('./reelController');
const { Reel, ReelNotification } = require('../models/Reel');
const reelUploadService = require('../utils/reelUploadService');
const mongoose = require('mongoose');

/**
 * Fixed version of getReels controller that avoids the length property error
 * 
 * This function replaces the original getReels function in reelController
 */
const getReelsFixed = async (req, res) => {
  try {
    console.log('🔍 Using fixed reels controller');
    console.log('Request query:', req.query);
    const { 
      propertyId, roomId, bedId, landlordId, 
      limit = 10, page = 1, sort = 'latest',
      sortBy, sortOrder, skip: skipParam
    } = req.query;
    
    // Safely parse numeric parameters
    const parsedLimit = parseInt(limit) || 10;
    const parsedPage = parseInt(page) || 1;
    
    console.log(`Processing request with: propertyId=${propertyId}, roomId=${roomId}, bedId=${bedId}`);
    console.log(`Pagination: page=${parsedPage}, limit=${parsedLimit}, sort=${sort}`);
    
    if (roomId) console.log(`roomId type: ${typeof roomId}, isObjectId: ${mongoose.Types.ObjectId.isValid(roomId)}`);
    if (bedId) console.log(`bedId type: ${typeof bedId}, isObjectId: ${mongoose.Types.ObjectId.isValid(bedId)}`);
    
    // Parse skip parameter or calculate from page and limit
    const skip = skipParam ? parseInt(skipParam) : (parsedPage - 1) * parsedLimit;
    
    // Build filter object - handle both ObjectIds and custom string IDs
    const filter = {};
    
    // Handle propertyId - should be a valid ObjectId
    if (propertyId) {
      if (mongoose.Types.ObjectId.isValid(propertyId)) {
        filter.propertyId = propertyId;
      } else {
        console.warn(`Invalid propertyId format: ${propertyId}`);
        return res.status(400).json({
          success: false,
          message: 'Invalid propertyId format',
          error: 'propertyId must be a valid MongoDB ObjectId'
        });
      }
    }
    
    // Handle roomId - support both ObjectId and custom format (e.g., "PROP69-R3")
    if (roomId) {
      try {
        const Room = require('../models/Room');
        let roomData;
        
        // Check if it's a valid ObjectId
        if (mongoose.Types.ObjectId.isValid(roomId)) {
          roomData = await Room.findOne({ _id: roomId });
          if (roomData) {
            // Use the room's actual ObjectId for the query
            filter.roomId = roomData._id;
          } else {
            console.warn(`Room not found with ObjectId: ${roomId}`);
            // Try to find by roomNumber as fallback
            roomData = await Room.findOne({ roomNumber: roomId });
            if (roomData) {
              filter.roomId = roomData._id;
            } else {
              console.warn(`Room not found with ID or roomNumber: ${roomId}`);
              // Return empty results instead of error when room not found
              return res.status(200).json({
                success: true,
                reels: [],
                pagination: {
                  totalReels: 0,
                  totalPages: 0,
                  currentPage: parseInt(page),
                  limit: parseInt(limit)
                }
              });
            }
          }
        } else {
          // It's not a valid ObjectId, try to find by roomNumber for custom format IDs
          roomData = await Room.findOne({ roomNumber: roomId });
          if (roomData) {
            filter.roomId = roomData._id;
          } else {
            console.warn(`Room not found with roomNumber: ${roomId}`);
            // Return empty results instead of error when room not found
            return res.status(200).json({
              success: true,
              reels: [],
              pagination: {
                totalReels: 0,
                totalPages: 0,
                currentPage: parseInt(page),
                limit: parseInt(limit)
              }
            });
          }
        }
      } catch (error) {
        console.error('Error looking up room:', error);
        // Return an error response with details
        return res.status(500).json({
          success: false,
          message: 'Error processing room ID',
          error: error.message
        });
      }
    }
    
    // Handle bedId - support both ObjectId and custom format (e.g., "PROP69-R3-B3")
    if (bedId) {
      try {
        const Bed = require('../models/Bed');
        let bedData;
        
        // Check if it's a valid ObjectId
        if (mongoose.Types.ObjectId.isValid(bedId)) {
          bedData = await Bed.findOne({ _id: bedId });
          if (bedData) {
            // Use the bed's actual ObjectId for the query
            filter.bedId = bedData._id;
          } else {
            console.warn(`Bed not found with ObjectId: ${bedId}`);
            // Try to find by bedNumber as fallback
            bedData = await Bed.findOne({ bedNumber: bedId });
            if (bedData) {
              filter.bedId = bedData._id;
            } else {
              console.warn(`Bed not found with ID or bedNumber: ${bedId}`);
              // Return empty results instead of error when bed not found
              return res.status(200).json({
                success: true,
                reels: [],
                pagination: {
                  totalReels: 0,
                  totalPages: 0,
                  currentPage: parseInt(page),
                  limit: parseInt(limit)
                }
              });
            }
          }
        } else {
          // It's not a valid ObjectId, try to find by bedNumber for custom format IDs
          bedData = await Bed.findOne({ bedNumber: bedId });
          if (bedData) {
            filter.bedId = bedData._id;
          } else {
            console.warn(`Bed not found with bedNumber: ${bedId}`);
            // Return empty results instead of error when bed not found
            return res.status(200).json({
              success: true,
              reels: [],
              pagination: {
                totalReels: 0,
                totalPages: 0,
                currentPage: parseInt(page),
                limit: parseInt(limit)
              }
            });
          }
        }
      } catch (error) {
        console.error('Error looking up bed:', error);
        // Return an error response with details
        return res.status(500).json({
          success: false,
          message: 'Error processing bed ID',
          error: error.message
        });
      }
    }
    
    if (landlordId) filter.landlordId = landlordId;
    filter.status = 'active';
    
    // Build sort object
    let sortOption = {};
    
    // Handle both sortBy/sortOrder and sort parameter for compatibility
    if (sortBy && sortOrder) {
      sortOption[sortBy] = sortOrder === 'desc' ? -1 : 1;
    } else if (sort === 'latest') {
      sortOption = { createdAt: -1 };
    } else if (sort === 'popular') {
      sortOption = { views: -1 };
    } else if (sort === 'trending') {
      // Trending is based on recent engagement
      sortOption = { views: -1, createdAt: -1 };
    }
    
    // Get total count for pagination using find().countDocuments() instead of directly calling countDocuments
    const totalReels = await Reel.find(filter).countDocuments();
    
    // Use the Mongoose API rather than aggregation for simplicity
    const reels = await Reel.find(filter)
      .sort(sortOption)
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .populate('landlordId', 'name email mobile profilePhoto');
    
    // Process reels to manually calculate counts and add signed URLs
    const processedReels = reels.map(reel => {
      const reelObj = reel.toObject({ virtuals: true });
      
      // Add counts safely
      reelObj.likesCount = (reelObj.likes && Array.isArray(reelObj.likes)) ? reelObj.likes.length : 0;
      reelObj.commentsCount = (reelObj.comments && Array.isArray(reelObj.comments)) ? reelObj.comments.length : 0;
      reelObj.sharesCount = (reelObj.shares && Array.isArray(reelObj.shares)) ? reelObj.shares.length : 0;
      reelObj.savesCount = (reelObj.saves && Array.isArray(reelObj.saves)) ? reelObj.saves.length : 0;
      
      // Generate signed URLs
      if (reelObj.videoKey) {
        reelObj.videoUrl = reelUploadService.getSignedUrl(reelObj.videoKey, 3600);
      } else {
        console.error(`Reel ${reelObj._id} has no videoKey`);
        reelObj.videoUrl = null;
      }
      
      if (reelObj.thumbnailKey) {
        reelObj.thumbnailUrl = reelUploadService.getSignedUrl(reelObj.thumbnailKey, 3600);
      } else {
        reelObj.thumbnailUrl = null;
      }
      
      // Remove the arrays to reduce payload size
      delete reelObj.likes;
      delete reelObj.comments;
      delete reelObj.shares;
      delete reelObj.saves;
      
      return reelObj;
    });
    
    return res.status(200).json({
      success: true,
      reels: processedReels,
      pagination: {
        totalReels,
        totalPages: Math.ceil(totalReels / parsedLimit),
        currentPage: parsedPage,
        limit: parsedLimit
      }
    });
  } catch (error) {
    console.error('❌ Error in getReelsFixed controller:', error);
    console.error('Stack trace:', error.stack);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Fixed version of the getReelAnalytics function that properly uses the
 * helper methods from the module exports object rather than 'this'
 */
const getReelAnalyticsFixed = async (req, res) => {
  try {
    console.log('🔍 Using fixed reel analytics controller');
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
      const dailyViews = await getDailyViewCount(landlordId, date, nextDate);
      const dailyLikes = await getDailyLikeCount(landlordId, date, nextDate);
      const dailyComments = await getDailyCommentCount(landlordId, date, nextDate);
      const dailyShares = await getDailyShareCount(landlordId, date, nextDate);
      const dailySaves = await getDailySaveCount(landlordId, date, nextDate);
      
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
    console.error('❌ Error in getReelAnalyticsFixed controller:', error);
    console.error('Stack trace:', error.stack);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Helper methods for analytics as standalone functions
const getDailyViewCount = async (landlordId, startDate, endDate) => {
  // This would typically use an analytics collection or event tracking
  // For now, we'll simulate this using the reel creation dates
  const reels = await Reel.find({
    landlordId,
    createdAt: { $gte: startDate, $lt: endDate }
  });
  
  return reels.reduce((total, reel) => total + (reel.views || 0), 0);
};

const getDailyLikeCount = async (landlordId, startDate, endDate) => {
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
};

const getDailyCommentCount = async (landlordId, startDate, endDate) => {
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
};

const getDailyShareCount = async (landlordId, startDate, endDate) => {
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
};

const getDailySaveCount = async (landlordId, startDate, endDate) => {
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
};

module.exports = { 
  getReelsFixed,
  getReelAnalyticsFixed
};
