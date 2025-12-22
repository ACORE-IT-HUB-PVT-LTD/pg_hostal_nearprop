const RatingService = require('../services/ratingService');
const Property = require('../models/Property');

/**
 * Controller for public access to property ratings and comments
 * These endpoints do not require authentication
 */
class PublicRatingController {
  /**
   * Get public rating statistics for a property
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @returns {Promise<void>}
   */
  static async getPropertyRatingStats(req, res) {
    try {
      const { propertyId } = req.params;
      
      // Verify property exists and is active - check both by _id and propertyId
      const property = await Property.findById(propertyId, { isActive: true }) || 
                       await Property.findOne({ propertyId, isActive: true });
      if (!property) {
        return res.status(404).json({
          success: false,
          message: 'Property not found or inactive'
        });
      }
      
      const stats = await RatingService.getPropertyRatingStats(propertyId);
      
      res.status(200).json({
        success: true,
        stats
      });
    } catch (error) {
      console.error('Error in getPropertyRatingStats controller:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error fetching property rating statistics'
      });
    }
  }

  /**
   * Get public ratings and reviews for a property (without auth)
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @returns {Promise<void>}
   */
  static async getPublicPropertyRatings(req, res) {
    try {
      const { propertyId } = req.params;
      const { page, limit, sortBy, sortOrder } = req.query;
      
      // Verify property exists and is active - check both by _id and propertyId
      const property = await Property.findById(propertyId, { isActive: true }) || 
                       await Property.findOne({ propertyId, isActive: true });
      if (!property) {
        return res.status(404).json({
          success: false,
          message: 'Property not found or inactive'
        });
      }
      
      const options = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10,
        sortBy: sortBy || 'createdAt',
        sortOrder: sortOrder || 'desc'
      };
      
      const result = await RatingService.getPropertyRatings(propertyId, options);
      
      res.status(200).json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Error in getPublicPropertyRatings controller:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error fetching property ratings'
      });
    }
  }

  /**
   * Get public comments for a property (without auth)
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @returns {Promise<void>}
   */
  static async getPublicPropertyComments(req, res) {
    try {
      const { propertyId } = req.params;
      const { page, limit } = req.query;
      
      // Verify property exists and is active - check both by _id and propertyId
      const property = await Property.findById(propertyId, { isActive: true }) || 
                       await Property.findOne({ propertyId, isActive: true });
      if (!property) {
        return res.status(404).json({
          success: false,
          message: 'Property not found or inactive'
        });
      }
      
      const options = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10
      };
      
      const result = await RatingService.getPropertyComments(propertyId, options);
      
      res.status(200).json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Error in getPublicPropertyComments controller:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error fetching property comments'
      });
    }
  }
}

module.exports = PublicRatingController;
