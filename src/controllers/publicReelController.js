const { Reel } = require('../models/Reel');
const { Landlord } = require('../models/Landlord');
const Tenant = require('../models/Tenant'); // For tenant authentication
const sanitize = require('../utils/sanitize');
const reelUploadService = require('../utils/reelUploadService');
const notificationService = require('../utils/notificationService');

/**
 * Public Reels Controller - For endpoints that don't require authentication
 * This allows users without tokens to view reels shared with them
 */

/**
 * Get a public reel by ID without requiring authentication
 * This enables shared reels to be viewed by anyone with the link
 */
const getPublicReel = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find the reel and increment the view count
    const reel = await Reel.findByIdAndUpdate(
      id,
      { $inc: { views: 1 } },
      { new: true }
    ).populate('landlordId', 'name email mobile profilePhoto');
    
    if (!reel) {
      return res.status(404).json({
        success: false,
        message: 'Reel not found'
      });
    }
    
    // Process reel to add signed URLs and counts
    const processedReel = processReel(reel);
    
    return res.status(200).json({
      success: true,
      reel: processedReel
    });
  } catch (error) {
    console.error('Error in getPublicReel:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Get all public reels with optional filtering
 * No authentication required
 */
const getPublicReels = async (req, res) => {
  try {
    const { 
      propertyId, roomId, bedId, landlordId, 
      limit = 10, page = 1, sort = 'trending',
      sortBy, sortOrder, tags
    } = req.query;
    
    const skip = req.query.skip || (parseInt(page) - 1) * parseInt(limit);
    
    // Build filter object
    const filter = { status: 'active' };
    if (propertyId) filter.propertyId = propertyId;
    if (roomId) filter.roomId = roomId;
    if (bedId) filter.bedId = bedId;
    if (landlordId) filter.landlordId = landlordId;
    
    // Handle tags filtering
    if (tags) {
      const tagArray = tags.split(',').map(tag => tag.trim());
      filter.tags = { $in: tagArray };
    }
    
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
      // Trending is based on recent engagement and views
      sortOption = { views: -1, createdAt: -1 };
    }
    
    // Get total count for pagination
    const totalReels = await Reel.find(filter).countDocuments();
    
    // Get reels with pagination and sorting
    const reels = await Reel.find(filter)
      .sort(sortOption)
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .populate('landlordId', 'name email mobile profilePhoto');
    
    // Process reels for response
    const processedReels = reels.map(reel => processReel(reel));
    
    return res.status(200).json({
      success: true,
      reels: processedReels,
      pagination: {
        totalReels,
        totalPages: Math.ceil(totalReels / parseInt(limit)),
        currentPage: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error in getPublicReels:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Helper function to process a reel for response
 * Adds signed URLs and calculates counts
 */
const processReel = (reel) => {
  const reelObj = reel.toObject({ virtuals: true });
  
  // Add counts safely
  reelObj.likesCount = (reelObj.likes && Array.isArray(reelObj.likes)) ? reelObj.likes.length : 0;
  reelObj.commentsCount = (reelObj.comments && Array.isArray(reelObj.comments)) ? reelObj.comments.length : 0;
  reelObj.sharesCount = (reelObj.shares && Array.isArray(reelObj.shares)) ? reelObj.shares.length : 0;
  reelObj.savesCount = (reelObj.saves && Array.isArray(reelObj.saves)) ? reelObj.saves.length : 0;
  
  // Generate signed URLs
  reelObj.videoUrl = reelUploadService.getSignedUrl(reelObj.videoKey, 3600);
  if (reelObj.thumbnailKey) {
    reelObj.thumbnailUrl = reelUploadService.getSignedUrl(reelObj.thumbnailKey, 3600);
  }
  
  // Keep comments for display but remove other arrays to reduce payload size
  const formattedComments = reelObj.comments && Array.isArray(reelObj.comments) 
    ? reelObj.comments.map(comment => {
        const { userId, text, createdAt } = comment;
        return {
          userId: typeof userId === 'object' ? {
            _id: userId._id,
            name: userId.name,
            profilePhoto: userId.profilePhoto
          } : userId,
          text,
          createdAt
        };
      })
    : [];

  reelObj.formattedComments = formattedComments;
  
  // Remove arrays to reduce payload size
  delete reelObj.likes;
  delete reelObj.comments;
  delete reelObj.shares;
  delete reelObj.saves;
  
  return reelObj;
};

/**
 * Enhanced interaction controllers with notification support
 */

/**
 * Like a reel with optional authentication
 * If authenticated, we store the user info; if not, we only increment the count
 */
const likeReel = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user ? req.user.id : null;
    
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
    
    let message = 'Reel liked successfully';
    let statusCode = 200;
    
    if (userId) {
      // Check if user has already liked the reel
      const alreadyLiked = reel.likes.some(like => like.toString() === userId);
      
      if (alreadyLiked) {
        message = 'Reel already liked';
      } else {
        // Add user to likes array
        reel.likes.push(userId);
        await reel.save();
        
        // Get user information for notification
        const user = await Tenant.findById(userId).select('name mobile email profilePhoto');
        
        // Send notification to landlord
        if (user) {
          await notificationService.sendLikeNotification(
            reel.landlordId,
            reel._id,
            user,
            reel.title
          );
        }
      }
    } else {
      // For anonymous users, just increment a general like count
      reel.anonymousLikes = (reel.anonymousLikes || 0) + 1;
      await reel.save();
    }
    
    return res.status(statusCode).json({
      success: true,
      message,
      likesCount: (reel.likes ? reel.likes.length : 0) + (reel.anonymousLikes || 0)
    });
  } catch (error) {
    console.error('Error in likeReel:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Add comment to a reel with optional authentication
 */
const addComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;
    const userId = req.user ? req.user.id : null;
    
    if (!text) {
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
    
    let user = null;
    
    // Create comment object
    const comment = {
      text,
      createdAt: new Date()
    };
    
    if (userId) {
      // Add user reference if authenticated
      comment.userId = userId;
      
      // Get user information for notification
      user = await Tenant.findById(userId).select('name mobile email profilePhoto');
    } else {
      // For anonymous users, mark as anonymous
      comment.isAnonymous = true;
      comment.anonymousIdentifier = req.ip || 'unknown';
    }
    
    // Add comment to reel
    reel.comments.push(comment);
    await reel.save();
    
    // Get the newly added comment with its ID
    const newComment = reel.comments[reel.comments.length - 1];
    
    // Send notification to landlord
    if (user) {
      await notificationService.sendCommentNotification(
        reel.landlordId,
        reel._id,
        user,
        text,
        reel.title
      );
    }
    
    return res.status(201).json({
      success: true,
      message: 'Comment added successfully',
      comment: {
        _id: newComment._id,
        text: newComment.text,
        createdAt: newComment.createdAt,
        user: user ? {
          _id: user._id,
          name: user.name,
          profilePhoto: user.profilePhoto
        } : null,
        isAnonymous: !user
      },
      commentsCount: reel.comments.length
    });
  } catch (error) {
    console.error('Error in addComment:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Increment view count for a reel
 * No authentication required
 */
const viewReel = async (req, res) => {
  try {
    const { id } = req.params;
    
    const reel = await Reel.findByIdAndUpdate(
      id,
      { $inc: { views: 1 } },
      { new: true }
    );
    
    if (!reel) {
      return res.status(404).json({
        success: false,
        message: 'Reel not found'
      });
    }
    
    return res.status(200).json({
      success: true,
      message: 'View count incremented',
      views: reel.views
    });
  } catch (error) {
    console.error('Error in viewReel:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Get statistics for landlord's reels
 */
const getLandlordReelStats = async (req, res) => {
  try {
    const landlordId = req.user.id;
    
    // Get all reels for this landlord
    const reels = await Reel.find({ landlordId });
    
    // Calculate statistics
    let totalViews = 0;
    let totalLikes = 0;
    let totalComments = 0;
    let totalShares = 0;
    
    const reelStats = reels.map(reel => {
      const likesCount = sanitize.hasItems(reel.likes) ? reel.likes.length : 0;
      const commentsCount = sanitize.hasItems(reel.comments) ? reel.comments.length : 0;
      const sharesCount = sanitize.hasItems(reel.shares) ? reel.shares.length : 0;
      
      totalViews += reel.views || 0;
      totalLikes += likesCount;
      totalComments += commentsCount;
      totalShares += sharesCount;
      
      return {
        id: reel._id,
        title: reel.title,
        views: reel.views || 0,
        likes: likesCount,
        comments: commentsCount,
        shares: sharesCount,
        createdAt: reel.createdAt
      };
    });
    
    // Get property-wise stats
    const propertyReelsMap = {};
    
    for (const reel of reels) {
      const propId = reel.propertyId.toString();
      if (!propertyReelsMap[propId]) {
        propertyReelsMap[propId] = {
          propertyId: propId,
          totalReels: 0,
          totalViews: 0,
          totalLikes: 0,
          totalComments: 0,
          totalShares: 0
        };
      }
      
      propertyReelsMap[propId].totalReels += 1;
      propertyReelsMap[propId].totalViews += reel.views || 0;
      propertyReelsMap[propId].totalLikes += sanitize.hasItems(reel.likes) ? reel.likes.length : 0;
      propertyReelsMap[propId].totalComments += sanitize.hasItems(reel.comments) ? reel.comments.length : 0;
      propertyReelsMap[propId].totalShares += sanitize.hasItems(reel.shares) ? reel.shares.length : 0;
    }
    
    const propertyStats = Object.values(propertyReelsMap);
    
    return res.status(200).json({
      success: true,
      overview: {
        totalReels: reels.length,
        totalViews,
        totalLikes,
        totalComments,
        totalShares,
        averageViewsPerReel: reels.length > 0 ? Math.round(totalViews / reels.length) : 0,
        engagementRate: totalViews > 0 ? ((totalLikes + totalComments + totalShares) / totalViews * 100).toFixed(2) : 0
      },
      reelStats,
      propertyStats
    });
  } catch (error) {
    console.error('Error in getLandlordReelStats:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

module.exports = {
  getPublicReel,
  getPublicReels,
  likeReel,
  addComment,
  viewReel,
  getLandlordReelStats,
  processReel
};
