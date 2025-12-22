const Rating = require('../models/Rating');
const Comment = require('../models/Comment');
const Property = require('../models/Property');
const User = require('../models/User');
const mongoose = require('mongoose');

/**
 * Service for handling property ratings, reviews, and comments
 */
class RatingService {
  /**
   * Add or update a rating and review for a property
   * @param {string} propertyId - Property ID
   * @param {string} userId - User ID
   * @param {number} rating - Rating value (1-5)
   * @param {string} review - Review text
   * @returns {Promise<Object>} - Rating object
   */
  static async addOrUpdateRating(propertyId, userId, rating, review) {
    try {
      // Validate property existence using _id field or propertyId field
      const property = await Property.findById(propertyId) || await Property.findOne({ propertyId });
      if (!property) {
        throw new Error('Property not found');
      }

      // Get user details - if user doesn't exist, create a basic user record for them
      let user = await User.findById(userId);
      if (!user) {
        // If using JWT token, we already have a valid user ID, so use minimal user info
        user = { 
          _id: userId,
          name: "Guest User" 
        };
      }

      // Check if rating already exists from this user
      const existingRating = await Rating.findOne({ propertyId, userId });
      
      if (existingRating) {
        // Update existing rating
        existingRating.rating = rating;
        existingRating.review = review || existingRating.review;
        existingRating.updatedAt = Date.now();
        await existingRating.save();
        
        // Recalculate average rating
        await this.recalculatePropertyRating(propertyId);
        
        return existingRating;
      } else {
        // Create new rating
        const newRating = new Rating({
          propertyId,
          userId,
          userName: user.name,
          rating,
          review,
          landlordId: property.landlordId
        });
        
        await newRating.save();
        
        // Recalculate average rating
        await this.recalculatePropertyRating(propertyId);
        
        return newRating;
      }
    } catch (error) {
      console.error('Error in addOrUpdateRating:', error);
      throw error;
    }
  }

  /**
   * Add a comment to a property
   * @param {string} propertyId - Property ID
   * @param {string} userId - User ID
   * @param {string} comment - Comment text
   * @returns {Promise<Object>} - Comment object
   */
  static async addComment(propertyId, userId, comment) {
    try {
      // Validate property existence using _id field or propertyId field
      const property = await Property.findById(propertyId) || await Property.findOne({ propertyId });
      if (!property) {
        throw new Error('Property not found');
      }

      // Get user details - if user doesn't exist, create a basic user record for them
      let user = await User.findById(userId);
      if (!user) {
        // If using JWT token, we already have a valid user ID, so use minimal user info
        user = { 
          _id: userId,
          name: "Guest User" 
        };
      }
      
      // Create new comment
      const newComment = new Comment({
        propertyId,
        userId,
        userName: user.name,
        comment,
        landlordId: property.landlordId
      });
      
      await newComment.save();
      return newComment;
    } catch (error) {
      console.error('Error in addComment:', error);
      throw error;
    }
  }

  /**
   * Add a reply to a comment
   * @param {string} commentId - Comment ID
   * @param {string} userId - User ID
   * @param {string} text - Reply text
   * @param {string} userType - Type of user (user, landlord, admin)
   * @returns {Promise<Object>} - Updated comment with reply
   */
  static async addReplyToComment(commentId, userId, text, userType = 'user') {
    try {
      const comment = await Comment.findById(commentId);
      if (!comment) {
        throw new Error('Comment not found');
      }

      // Get user details - if user doesn't exist, create a basic user record for them
      let user = await User.findById(userId);
      if (!user) {
        // If using JWT token, we already have a valid user ID, so use minimal user info
        user = { 
          _id: userId,
          name: "Guest User" 
        };
      }
      
      // Add reply to comment
      comment.replies.push({
        userId,
        userName: user.name,
        userType,
        text,
        createdAt: Date.now()
      });
      
      await comment.save();
      return comment;
    } catch (error) {
      console.error('Error in addReplyToComment:', error);
      throw error;
    }
  }

  /**
   * Get all ratings and reviews for a property
   * @param {string} propertyId - Property ID
   * @param {Object} options - Query options (pagination, sorting)
   * @returns {Promise<Object>} - Ratings and property stats
   */
  static async getPropertyRatings(propertyId, options = {}) {
    try {
      if (!propertyId) {
        throw new Error('Property ID is required');
      }
      
      // Verify property exists - check both by _id and propertyId
      const property = await Property.findById(propertyId) || await Property.findOne({ propertyId });
      if (!property) {
        throw new Error('Property not found');
      }
      
      // Validate and sanitize options
      const page = Math.max(1, parseInt(options.page) || 1); // Minimum page 1
      const limit = Math.min(100, Math.max(1, parseInt(options.limit) || 10)); // Between 1 and 100
      const skip = (page - 1) * limit;
      
      // Validate sortBy field (prevent injection)
      const allowedSortFields = ['createdAt', 'rating', 'updatedAt'];
      const sortBy = allowedSortFields.includes(options.sortBy) ? options.sortBy : 'createdAt';
      
      // Validate sortOrder
      const sortOrder = options.sortOrder === 'asc' ? 1 : -1;
      
      const sort = {};
      sort[sortBy] = sortOrder;

      // Get ratings for the property with proper error handling
      const ratings = await Rating.find({ propertyId, isActive: true })
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .catch(err => {
          console.error('Database error fetching ratings:', err);
          return []; // Return empty array on error instead of failing completely
        });
      
      // Get ratings stats
      const stats = await this.getPropertyRatingStats(propertyId);
      
      // Calculate total pages
      const totalPages = Math.ceil(stats.totalRatings / limit);
      
      return {
        ratings,
        stats,
        pagination: {
          page,
          limit,
          totalRatings: stats.totalRatings,
          totalPages: totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      };
    } catch (error) {
      console.error('Error in getPropertyRatings:', error);
      throw error;
    }
  }

  /**
   * Get all comments for a property
   * @param {string} propertyId - Property ID
   * @param {Object} options - Query options (pagination, sorting)
   * @returns {Promise<Object>} - Comments and pagination info
   */
  static async getPropertyComments(propertyId, options = {}) {
    try {
      if (!propertyId) {
        throw new Error('Property ID is required');
      }
      
      // Verify property exists - check both by _id and propertyId
      const property = await Property.findById(propertyId) || await Property.findOne({ propertyId });
      if (!property) {
        throw new Error('Property not found');
      }
      
      // Validate and sanitize options
      const page = Math.max(1, parseInt(options.page) || 1); // Minimum page 1
      const limit = Math.min(100, Math.max(1, parseInt(options.limit) || 10)); // Between 1 and 100
      const skip = (page - 1) * limit;
      
      // Validate sortBy field (prevent injection)
      const allowedSortFields = ['createdAt', 'updatedAt'];
      const sortBy = allowedSortFields.includes(options.sortBy) ? options.sortBy : 'createdAt';
      
      // Validate sortOrder
      const sortOrder = options.sortOrder === 'asc' ? 1 : -1;
      
      const sort = {};
      sort[sortBy] = sortOrder;
      
      // Get comments for the property with proper error handling
      const comments = await Comment.find({ propertyId, isActive: true })
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .catch(err => {
          console.error('Database error fetching comments:', err);
          return []; // Return empty array on error instead of failing completely
        });
      
      // Get total comment count
      const totalComments = await Comment.countDocuments({ propertyId, isActive: true });
      
      // Calculate total pages
      const totalPages = Math.ceil(totalComments / limit);
      
      return {
        comments,
        pagination: {
          page,
          limit,
          totalComments,
          totalPages: totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      };
    } catch (error) {
      console.error('Error in getPropertyComments:', error);
      throw error;
    }
  }

  /**
   * Get rating statistics for a property
   * @param {string} propertyId - Property ID
   * @returns {Promise<Object>} - Rating statistics
   */
  static async getPropertyRatingStats(propertyId) {
    try {
      const ratings = await Rating.find({ propertyId, isActive: true });
      
      if (!ratings || ratings.length === 0) {
        return {
          averageRating: 0,
          totalRatings: 0,
          ratingDistribution: {
            1: 0,
            2: 0,
            3: 0,
            4: 0,
            5: 0
          }
        };
      }
      
      const totalRatings = ratings.length;
      const ratingSum = ratings.reduce((sum, rating) => sum + rating.rating, 0);
      const averageRating = ratingSum / totalRatings;
      
      // Calculate rating distribution
      const ratingDistribution = {
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0
      };
      
      ratings.forEach(rating => {
        ratingDistribution[rating.rating]++;
      });
      
      return {
        averageRating: parseFloat(averageRating.toFixed(1)),
        totalRatings,
        ratingDistribution
      };
    } catch (error) {
      console.error('Error in getPropertyRatingStats:', error);
      throw error;
    }
  }

  /**
   * Recalculate the average rating for a property
   * (This would be used to update any cached values if needed)
   * @param {string} propertyId - Property ID
   * @returns {Promise<number>} - New average rating
   */
  static async recalculatePropertyRating(propertyId) {
    try {
      const stats = await this.getPropertyRatingStats(propertyId);
      return stats.averageRating;
    } catch (error) {
      console.error('Error in recalculatePropertyRating:', error);
      throw error;
    }
  }

  /**
   * Get all ratings and comments for a landlord's properties
   * @param {string} landlordId - Landlord ID
   * @param {Object} options - Query options (pagination, sorting)
   * @returns {Promise<Object>} - Ratings, comments, and stats per property
   */
  static async getLandlordPropertyRatings(landlordId, options = {}) {
    try {
      console.log('Getting ratings for landlord ID:', landlordId);
      
      const page = options.page || 1;
      const limit = options.limit || 10;
      const skip = (page - 1) * limit;
      
      // Get all ratings for landlord's properties
      // Use $eq with landlordId directly (MongoDB will handle type conversion)
      console.log(`Looking for ratings with landlordId: ${landlordId}`);
      let ratings = await Rating.find({ 
        landlordId: landlordId, 
        isActive: true 
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
      
      // Get total ratings count
      const totalRatings = await Rating.countDocuments({ landlordId: landlordId, isActive: true });
      
      // For debugging
      console.log(`Found ${totalRatings} ratings for landlord ${landlordId}`);
      
      // Let's also check if there are any properties that belong to this landlord
      const properties = await Property.find({ landlordId: landlordId });
      console.log(`Found ${properties.length} properties belonging to landlord ${landlordId}`);
      
      // Get property IDs from those properties
      const landlordPropertyIds = properties.map(p => p.propertyId || p._id.toString());
      console.log('Landlord property IDs:', landlordPropertyIds);
      
      // Perform a separate query to see all ratings in the system
      const allRatings = await Rating.find({ isActive: true });
      console.log(`Total ratings in system: ${allRatings.length}`);
      console.log('Sample ratings with landlordIds:', allRatings.map(r => ({ 
        id: r._id, 
        landlordId: r.landlordId.toString(),
        propertyId: r.propertyId
      })));
      
      // If we didn't find any ratings with the landlordId directly, let's try to find
      // ratings for properties owned by this landlord
      if (ratings.length === 0 && landlordPropertyIds.length > 0) {
        console.log('No ratings found directly with landlordId, trying to find by propertyId');
        const propertyRatings = await Rating.find({ 
          propertyId: { $in: landlordPropertyIds }, 
          isActive: true 
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
        
        if (propertyRatings.length > 0) {
          console.log(`Found ${propertyRatings.length} ratings by propertyId lookup`);
          // Use these ratings instead
          ratings = propertyRatings;
        }
      }
      
      // Get property IDs from ratings
      const propertyIds = [...new Set(ratings.map(rating => rating.propertyId))];
      
      // Get stats for each property
      const propertyStats = await Promise.all(
        propertyIds.map(async (propertyId) => {
          const stats = await this.getPropertyRatingStats(propertyId);
          const property = await Property.findOne({ propertyId }, { name: 1 });
          
          return {
            propertyId,
            propertyName: property ? property.name : 'Unknown Property',
            ...stats
          };
        })
      );
      
      return {
        ratings,
        propertyStats,
        pagination: {
          page,
          limit,
          totalRatings
        }
      };
    } catch (error) {
      console.error('Error in getLandlordPropertyRatings:', error);
      throw error;
    }
  }
}

module.exports = RatingService;
