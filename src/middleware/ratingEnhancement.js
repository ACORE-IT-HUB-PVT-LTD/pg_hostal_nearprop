/**
 * This script enhances the Property model to include rating summary information
 * It adds a virtual field to the property model that displays rating information
 */

const mongoose = require('mongoose');
const Property = require('../models/Property');
const Rating = require('../models/Rating');
const Comment = require('../models/Comment');

// Add virtual fields to the Property schema for ratings and comments
Property.schema.virtual('ratingsSummary', {
  ref: 'Rating',
  localField: 'propertyId',
  foreignField: 'propertyId',
  justOne: false,
  options: { match: { isActive: true } },
  // Transform function to calculate summary statistics
  get: function() {
    return function(cb) {
      return Rating.aggregate([
        { $match: { propertyId: this.propertyId, isActive: true } },
        {
          $group: {
            _id: null,
            averageRating: { $avg: '$rating' },
            totalRatings: { $sum: 1 },
            rating1Count: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
            rating2Count: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
            rating3Count: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
            rating4Count: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
            rating5Count: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } }
          }
        },
        {
          $project: {
            _id: 0,
            averageRating: { $round: ['$averageRating', 1] },
            totalRatings: 1,
            ratingDistribution: {
              1: '$rating1Count',
              2: '$rating2Count',
              3: '$rating3Count',
              4: '$rating4Count',
              5: '$rating5Count'
            }
          }
        }
      ])
        .exec()
        .then(results => {
          if (results && results.length > 0) {
            return results[0];
          }
          return {
            averageRating: 0,
            totalRatings: 0,
            ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
          };
        });
    };
  }
});

// Add virtual field for comments count
Property.schema.virtual('commentsCount', {
  ref: 'Comment',
  localField: 'propertyId',
  foreignField: 'propertyId',
  count: true,
  match: { isActive: true }
});

// Middleware to attach rating summary to property responses
const attachRatingSummary = async (req, res, next) => {
  const originalSend = res.send;
  const originalJson = res.json;

  // Override the send method to enhance property data
  res.send = async function(data) {
    try {
      // Check if the response contains property data
      if (data) {
        let parsedData;
        try {
          parsedData = typeof data === 'string' ? JSON.parse(data) : data;
        } catch (e) {
          console.error('Error parsing response data:', e);
          return originalSend.call(this, data);
        }
        
        // Handle different response formats
        if (parsedData && parsedData.property) {
          // Format 1: Single property in property field
          await enhanceSingleProperty(parsedData.property);
          
          // Convert back to string if needed
          if (typeof data === 'string') {
            data = JSON.stringify(parsedData);
          } else {
            data = parsedData;
          }
        } else if (parsedData && parsedData.properties && Array.isArray(parsedData.properties)) {
          // Format 2: Array of properties in properties field
          await enhancePropertyArray(parsedData.properties);
          
          // Convert back to string if needed
          if (typeof data === 'string') {
            data = JSON.stringify(parsedData);
          } else {
            data = parsedData;
          }
        } else if (parsedData && parsedData.data && parsedData.data.property) {
          // Format 3: Single property in data.property field (common in many APIs)
          await enhanceSingleProperty(parsedData.data.property);
          
          // Convert back to string if needed
          if (typeof data === 'string') {
            data = JSON.stringify(parsedData);
          } else {
            data = parsedData;
          }
        } else if (parsedData && parsedData.data && parsedData.data.properties && Array.isArray(parsedData.data.properties)) {
          // Format 4: Array of properties in data.properties field
          await enhancePropertyArray(parsedData.data.properties);
          
          // Convert back to string if needed
          if (typeof data === 'string') {
            data = JSON.stringify(parsedData);
          } else {
            data = parsedData;
          }
        } else if (parsedData && Array.isArray(parsedData) && parsedData.length > 0 && parsedData[0].propertyId) {
          // Format 5: Direct array of property objects
          await enhancePropertyArray(parsedData);
          
          // Convert back to string if needed
          if (typeof data === 'string') {
            data = JSON.stringify(parsedData);
          } else {
            data = parsedData;
          }
        } else if (parsedData && parsedData.success && parsedData.data && Array.isArray(parsedData.data)) {
          // Format 6: Success response with data array that might contain properties
          const potentialProperties = parsedData.data.filter(item => item && item.propertyId);
          if (potentialProperties.length > 0) {
            await enhancePropertyArray(potentialProperties);
            
            // Convert back to string if needed
            if (typeof data === 'string') {
              data = JSON.stringify(parsedData);
            } else {
              data = parsedData;
            }
          }
        }
      }
    } catch (error) {
      console.error('Error attaching rating summary:', error);
    }
    
    return originalSend.call(this, data);
  };

  // Store original json method
  res.json = function(obj) {
    // Call the original json method directly instead of going through our custom send method
    return originalJson.call(this, obj);
  };
  
  next();
};

// Helper function to enhance a single property with ratings
async function enhanceSingleProperty(property) {
  if (!property || !property.propertyId) return;
  
  try {
    const ratingSummary = await getRatingSummary(property.propertyId);
    const commentCount = await getCommentCount(property.propertyId);
    
    property.ratingSummary = ratingSummary;
    property.commentCount = commentCount;
  } catch (error) {
    console.error(`Error enhancing property ${property.propertyId}:`, error);
  }
}

// Helper function to enhance an array of properties with ratings
async function enhancePropertyArray(properties) {
  if (!properties || !Array.isArray(properties)) return;
  
  try {
    await Promise.all(
      properties.map(async (property) => {
        if (property && property.propertyId) {
          await enhanceSingleProperty(property);
        }
        return property;
      })
    );
  } catch (error) {
    console.error('Error enhancing property array:', error);
  }
}

// Helper function to get rating summary for a property
async function getRatingSummary(propertyId) {
  try {
    const result = await Rating.aggregate([
      { $match: { propertyId, isActive: true } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$rating' },
          totalRatings: { $sum: 1 },
          rating1Count: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
          rating2Count: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
          rating3Count: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
          rating4Count: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
          rating5Count: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } }
        }
      },
      {
        $project: {
          _id: 0,
          averageRating: { $round: ['$averageRating', 1] },
          totalRatings: 1,
          ratingDistribution: {
            1: '$rating1Count',
            2: '$rating2Count',
            3: '$rating3Count',
            4: '$rating4Count',
            5: '$rating5Count'
          }
        }
      }
    ]);
    
    if (result && result.length > 0) {
      return result[0];
    }
    
    return {
      averageRating: 0,
      totalRatings: 0,
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    };
  } catch (error) {
    console.error('Error getting rating summary:', error);
    return {
      averageRating: 0,
      totalRatings: 0,
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    };
  }
}

// Helper function to get comment count for a property
async function getCommentCount(propertyId) {
  try {
    const count = await Comment.countDocuments({ propertyId, isActive: true });
    return count || 0;
  } catch (error) {
    console.error('Error getting comment count:', error);
    return 0;
  }
}

module.exports = {
  attachRatingSummary
};
