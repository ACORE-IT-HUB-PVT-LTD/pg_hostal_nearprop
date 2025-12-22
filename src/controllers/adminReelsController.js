const { Reel, ReelNotification } = require('../models/Reel');
const Landlord = require('../models/Landlord');
const Property = require('../models/Property');
const mongoose = require('mongoose');

/**
 * Admin Reels Controller
 * Handles reels management operations for admin panel
 */
const adminReelsController = {
  /**
   * Get all reels with pagination and filtering
   * @route GET /api/admin/reels
   */
  getAllReels: async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      
      // Filter options
      const filter = {};
      
      // Filter by landlord ID if provided
      if (req.query.landlordId && mongoose.Types.ObjectId.isValid(req.query.landlordId)) {
        filter.landlordId = req.query.landlordId;
      }
      
      // Filter by property ID if provided
      if (req.query.propertyId && mongoose.Types.ObjectId.isValid(req.query.propertyId)) {
        filter.propertyId = req.query.propertyId;
      }
      
      // Filter by active status if provided
      if (req.query.isActive !== undefined) {
        filter.status = req.query.isActive === 'true' ? 'active' : 'inactive';
      }
      
      // Filter by tags
      if (req.query.tags) {
        const tags = req.query.tags.split(',').map(tag => tag.trim());
        filter.tags = { $in: tags };
      }
      
      // Use Mongoose paginate method
      const result = await Reel.paginate(filter, {
        page,
        limit,
        sort: { createdAt: -1 },
        select: 'title description videoUrl thumbnailUrl views likes status tags createdAt',
        populate: [
          { path: 'landlordId', select: 'name email mobile' },
          { path: 'propertyId', select: 'name address' }
        ]
      });
      
      // Get reels from the paginate result
      const reels = result.docs;
      
      // Format reels data
      const reelsData = reels.map(reel => ({
        id: reel._id,
        title: reel.title,
        description: reel.description,
        videoUrl: reel.videoUrl,
        thumbnailUrl: reel.thumbnailUrl,
        views: reel.views,
        likes: reel.likes,
        isActive: reel.isActive,
        tags: reel.tags,
        landlord: reel.landlordId ? {
          id: reel.landlordId._id,
          name: reel.landlordId.name,
          email: reel.landlordId.email,
          mobile: reel.landlordId.mobile
        } : null,
        property: reel.propertyId ? {
          id: reel.propertyId._id,
          name: reel.propertyId.name,
          address: reel.propertyId.address
        } : null,
        createdAt: reel.createdAt
      }));
      
      return res.status(200).json({
        success: true,
        reels: reelsData,
        pagination: {
          total: result.totalDocs,
          page: result.page,
          limit: result.limit,
          pages: result.totalPages
        }
      });
    } catch (error) {
      console.error('Get all reels error:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  },
  
  /**
   * Get detailed information about a specific reel
   * @route GET /api/admin/reels/:id
   */
  getReelDetails: async (req, res) => {
    try {
      const reelId = req.params.id;
      
      if (!mongoose.Types.ObjectId.isValid(reelId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid reel ID format'
        });
      }
      
      // Get reel with populated landlord and property info
      const reel = await Reel.findById(reelId)
        .populate('landlordId', 'name email mobile profilePhoto')
        .populate('propertyId', 'name address city pinCode isActive');
      
      if (!reel) {
        return res.status(404).json({
          success: false,
          message: 'Reel not found'
        });
      }
      
      // Format reel data
      const reelDetails = {
        id: reel._id,
        title: reel.title,
        description: reel.description,
        videoUrl: reel.videoUrl,
        thumbnailUrl: reel.thumbnailUrl,
        views: reel.views,
        likes: reel.likes,
        isActive: reel.isActive,
        tags: reel.tags,
        landlord: reel.landlordId ? {
          id: reel.landlordId._id,
          name: reel.landlordId.name,
          email: reel.landlordId.email,
          mobile: reel.landlordId.mobile,
          profilePhoto: reel.landlordId.profilePhoto
        } : null,
        property: reel.propertyId ? {
          id: reel.propertyId._id,
          name: reel.propertyId.name,
          address: reel.propertyId.address,
          city: reel.propertyId.city,
          pinCode: reel.propertyId.pinCode,
          isActive: reel.propertyId.isActive
        } : null,
        createdAt: reel.createdAt,
        updatedAt: reel.updatedAt
      };
      
      return res.status(200).json({
        success: true,
        reel: reelDetails
      });
    } catch (error) {
      console.error('Get reel details error:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  },
  
  /**
   * Toggle reel active status
   * @route PATCH /api/admin/reels/:id/toggle-status
   */
  toggleReelStatus: async (req, res) => {
    try {
      const reelId = req.params.id;
      
      if (!mongoose.Types.ObjectId.isValid(reelId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid reel ID format'
        });
      }
      
      // Get reel
      const reel = await Reel.findById(reelId);
      
      if (!reel) {
        return res.status(404).json({
          success: false,
          message: 'Reel not found'
        });
      }
      
      // Toggle status between active and inactive
      reel.status = reel.status === 'active' ? 'inactive' : 'active';
      
      await reel.save();
      
      const isActive = reel.status === 'active';
      
      return res.status(200).json({
        success: true,
        message: `Reel ${isActive ? 'activated' : 'deactivated'} successfully`,
        isActive: isActive
      });
    } catch (error) {
      console.error('Toggle reel status error:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  },
  
  /**
   * Get landlord's reels
   * @route GET /api/admin/landlords/:id/reels
   */
  getLandlordReels: async (req, res) => {
    try {
      const landlordId = req.params.id;
      
      if (!mongoose.Types.ObjectId.isValid(landlordId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid landlord ID format'
        });
      }
      
      // Check if landlord exists
      const landlord = await Landlord.findById(landlordId);
      if (!landlord) {
        return res.status(404).json({
          success: false,
          message: 'Landlord not found'
        });
      }
      
      // Pagination
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      
      // Filter options
      const filter = { landlordId };
      
      // Filter by active status if provided
      if (req.query.isActive !== undefined) {
        filter.status = req.query.isActive === 'true' ? 'active' : 'inactive';
      }
      
      // Use Mongoose paginate method
      const result = await Reel.paginate(filter, {
        page,
        limit,
        sort: { createdAt: -1 },
        select: 'title description videoUrl thumbnailUrl views likes status tags createdAt',
        populate: [
          { path: 'propertyId', select: 'name address' }
        ]
      });
      
      // Get reels from the paginate result
      const reels = result.docs;
      
      // Format reels data
      const reelsData = reels.map(reel => ({
        id: reel._id,
        title: reel.title,
        description: reel.description,
        videoUrl: reel.videoUrl,
        thumbnailUrl: reel.thumbnailUrl,
        views: reel.views,
        likes: reel.likes,
        isActive: reel.isActive,
        tags: reel.tags,
        property: reel.propertyId ? {
          id: reel.propertyId._id,
          name: reel.propertyId.name,
          address: reel.propertyId.address
        } : null,
        createdAt: reel.createdAt
      }));
      
      return res.status(200).json({
        success: true,
        landlord: {
          id: landlord._id,
          name: landlord.name,
          email: landlord.email,
          mobile: landlord.mobile
        },
        reels: reelsData,
        pagination: {
          total: result.totalDocs,
          page: result.page,
          limit: result.limit,
          pages: result.totalPages
        }
      });
    } catch (error) {
      console.error('Get landlord reels error:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  },
  
  /**
   * Get property's reels
   * @route GET /api/admin/properties/:id/reels
   */
  getPropertyReels: async (req, res) => {
    try {
      const propertyId = req.params.id;
      
      if (!mongoose.Types.ObjectId.isValid(propertyId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid property ID format'
        });
      }
      
      // Check if property exists
      const property = await Property.findById(propertyId);
      if (!property) {
        return res.status(404).json({
          success: false,
          message: 'Property not found'
        });
      }
      
      // Pagination
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      
      // Filter options
      const filter = { propertyId };
      
      // Filter by active status if provided
      if (req.query.isActive !== undefined) {
        filter.status = req.query.isActive === 'true' ? 'active' : 'inactive';
      }
      
      // Use Mongoose paginate method
      const result = await Reel.paginate(filter, {
        page,
        limit,
        sort: { createdAt: -1 },
        select: 'title description videoUrl thumbnailUrl views likes status tags createdAt',
        populate: [
          { path: 'landlordId', select: 'name email mobile' }
        ]
      });
      
      // Get reels from the paginate result
      const reels = result.docs;
      
      // Format reels data
      const reelsData = reels.map(reel => ({
        id: reel._id,
        title: reel.title,
        description: reel.description,
        videoUrl: reel.videoUrl,
        thumbnailUrl: reel.thumbnailUrl,
        views: reel.views,
        likes: reel.likes,
        isActive: reel.isActive,
        tags: reel.tags,
        landlord: reel.landlordId ? {
          id: reel.landlordId._id,
          name: reel.landlordId.name,
          email: reel.landlordId.email,
          mobile: reel.landlordId.mobile
        } : null,
        createdAt: reel.createdAt
      }));
      
      return res.status(200).json({
        success: true,
        property: {
          id: property._id,
          name: property.name,
          address: property.address,
          city: property.city,
          isActive: property.isActive
        },
        reels: reelsData,
        pagination: {
          total: result.totalDocs,
          page: result.page,
          limit: result.limit,
          pages: result.totalPages
        }
      });
    } catch (error) {
      console.error('Get property reels error:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  }
};

module.exports = adminReelsController;
