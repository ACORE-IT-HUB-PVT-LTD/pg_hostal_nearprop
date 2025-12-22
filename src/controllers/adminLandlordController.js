const Landlord = require('../models/Landlord');
const Property = require('../models/Property');
const Room = require('../models/Room');
const Bed = require('../models/Bed');
const { Reel, ReelNotification } = require('../models/Reel');
const mongoose = require('mongoose');

/**
 * Admin Landlord Controller
 * Handles landlord management operations for admin panel
 */
const adminLandlordController = {
  /**
   * Get all landlords with pagination and filtering
   * @route GET /api/admin/landlords
   */
  getAllLandlords: async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      
      // Filter options
      const filter = {};
      
      // Search by name, email or mobile
      if (req.query.search) {
        const searchRegex = new RegExp(req.query.search, 'i');
        filter.$or = [
          { name: searchRegex },
          { email: searchRegex },
          { mobile: searchRegex }
        ];
      }
      
      // Total count for pagination
      const totalLandlords = await Landlord.countDocuments(filter);
      
      // Get landlords with pagination
      const landlords = await Landlord.find(filter)
        .select('name email mobile profilePhoto properties createdAt')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 });
      
      // Get property counts for each landlord
      const landlordData = await Promise.all(landlords.map(async (landlord) => {
        const propertyCount = landlord.properties ? landlord.properties.length : 0;
        
        return {
          id: landlord._id,
          name: landlord.name,
          email: landlord.email,
          mobile: landlord.mobile,
          profilePhoto: landlord.profilePhoto,
          propertyCount,
          createdAt: landlord.createdAt
        };
      }));
      
      return res.status(200).json({
        success: true,
        landlords: landlordData,
        pagination: {
          total: totalLandlords,
          page,
          limit,
          pages: Math.ceil(totalLandlords / limit)
        }
      });
    } catch (error) {
      console.error('Get all landlords error:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  },
  
  /**
   * Get detailed information about a specific landlord
   * @route GET /api/admin/landlords/:id
   */
  getLandlordDetails: async (req, res) => {
    try {
      const landlordId = req.params.id;
      
      if (!mongoose.Types.ObjectId.isValid(landlordId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid landlord ID format'
        });
      }
      
      // Get landlord with populated properties
      const landlord = await Landlord.findById(landlordId)
        .select('-__v');
      
      if (!landlord) {
        return res.status(404).json({
          success: false,
          message: 'Landlord not found'
        });
      }
      
      // Get all properties for this landlord
      const properties = await Property.find({ 
        _id: { $in: landlord.properties } 
      }).select('name address isActive rooms createdAt');
      
      // Get all room and bed stats
      const propertyDetails = await Promise.all(properties.map(async (property) => {
        // Get room count
        const rooms = await Room.find({ 
          propertyId: property._id 
        }).select('roomNumber isActive beds');
        
        // Get bed count and occupancy
        let totalBeds = 0;
        let occupiedBeds = 0;
        
        for (const room of rooms) {
          const beds = await Bed.find({ roomId: room._id });
          totalBeds += beds.length;
          occupiedBeds += beds.filter(bed => bed.isOccupied).length;
        }
        
        return {
          id: property._id,
          name: property.name,
          address: property.address,
          isActive: property.isActive,
          stats: {
            roomCount: rooms.length,
            bedCount: totalBeds,
            occupiedBedCount: occupiedBeds,
            occupancyRate: totalBeds ? Math.round((occupiedBeds / totalBeds) * 100) : 0
          },
          createdAt: property.createdAt
        };
      }));
      
      // Get reels count
      const reelsCount = await Reel.countDocuments({ 
        landlordId: landlordId 
      });
      
      // Prepare response
      const landlordDetails = {
        id: landlord._id,
        name: landlord.name,
        email: landlord.email,
        mobile: landlord.mobile,
        address: landlord.address,
        state: landlord.state,
        pinCode: landlord.pinCode,
        gender: landlord.gender,
        profilePhoto: landlord.profilePhoto,
        createdAt: landlord.createdAt,
        stats: {
          propertyCount: properties.length,
          reelsCount
        },
        properties: propertyDetails
      };
      
      return res.status(200).json({
        success: true,
        landlord: landlordDetails
      });
    } catch (error) {
      console.error('Get landlord details error:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  },
  
  /**
   * Toggle landlord active status
   * @route PATCH /api/admin/landlords/:id/toggle-status
   */
  toggleLandlordStatus: async (req, res) => {
    try {
      const landlordId = req.params.id;
      
      if (!mongoose.Types.ObjectId.isValid(landlordId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid landlord ID format'
        });
      }
      
      // Get landlord
      const landlord = await Landlord.findById(landlordId);
      
      if (!landlord) {
        return res.status(404).json({
          success: false,
          message: 'Landlord not found'
        });
      }
      
      // Toggle isActive status
      // Since the Landlord model doesn't have an isActive field currently,
      // we'll add a custom field for admin control
      landlord.isActive = !landlord.isActive;
      
      await landlord.save();
      
      return res.status(200).json({
        success: true,
        message: `Landlord ${landlord.isActive ? 'activated' : 'deactivated'} successfully`,
        isActive: landlord.isActive
      });
    } catch (error) {
      console.error('Toggle landlord status error:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  },
  
  /**
   * Get landlord statistics
   * @route GET /api/admin/landlords/stats
   */
  getLandlordStats: async (req, res) => {
    try {
      // Get total counts
      const totalLandlords = await Landlord.countDocuments();
      const totalProperties = await Property.countDocuments();
      const totalRooms = await Room.countDocuments();
      const totalBeds = await Bed.countDocuments();
      const totalReels = await Reel.countDocuments();
      
      // Get occupied bed count
      const occupiedBeds = await Bed.countDocuments({ isOccupied: true });
      
      // Get active properties count
      const activeProperties = await Property.countDocuments({ isActive: true });
      
      // Get new landlords in last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const newLandlords = await Landlord.countDocuments({
        createdAt: { $gte: thirtyDaysAgo }
      });
      
      // Get new properties in last 30 days
      const newProperties = await Property.countDocuments({
        createdAt: { $gte: thirtyDaysAgo }
      });
      
      return res.status(200).json({
        success: true,
        stats: {
          totalLandlords,
          totalProperties,
          totalRooms,
          totalBeds,
          totalReels,
          occupiedBeds,
          activeProperties,
          occupancyRate: totalBeds ? Math.round((occupiedBeds / totalBeds) * 100) : 0,
          newLandlords,
          newProperties
        }
      });
    } catch (error) {
      console.error('Get landlord stats error:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  }
};

module.exports = adminLandlordController;
