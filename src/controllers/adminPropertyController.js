const Property = require('../models/Property');
const Room = require('../models/Room');
const Bed = require('../models/Bed');
const mongoose = require('mongoose');

/**
 * Admin Property Controller
 * Handles property management operations for admin panel
 */
const adminPropertyController = {
  /**
   * Get all properties with pagination and filtering
   * @route GET /api/admin/properties
   */
  getAllProperties: async (req, res) => {
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
      
      // Filter by active status if provided
      if (req.query.isActive !== undefined) {
        filter.isActive = req.query.isActive === 'true';
      }
      
      // Search by name or address
      if (req.query.search) {
        const searchRegex = new RegExp(req.query.search, 'i');
        filter.$or = [
          { name: searchRegex },
          { address: searchRegex },
          { city: searchRegex }
        ];
      }
      
      // Total count for pagination
      const totalProperties = await Property.countDocuments(filter);
      
      // Get properties with pagination and populated landlord info
      const properties = await Property.find(filter)
        .select('name address city pinCode isActive landlordId createdAt')
        .populate('landlordId', 'name email mobile')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 });
      
      // Get room and bed counts for each property
      const propertyData = await Promise.all(properties.map(async (property) => {
        // Count rooms
        const roomCount = await Room.countDocuments({ propertyId: property._id });
        
        // Count beds
        const bedCount = await Bed.countDocuments({ propertyId: property._id });
        
        // Count occupied beds
        const occupiedBedCount = await Bed.countDocuments({ 
          propertyId: property._id,
          isOccupied: true
        });
        
        return {
          id: property._id,
          name: property.name,
          address: property.address,
          city: property.city,
          pinCode: property.pinCode,
          isActive: property.isActive,
          landlord: property.landlordId ? {
            id: property.landlordId._id,
            name: property.landlordId.name,
            email: property.landlordId.email,
            mobile: property.landlordId.mobile
          } : null,
          stats: {
            roomCount,
            bedCount,
            occupiedBedCount,
            occupancyRate: bedCount ? Math.round((occupiedBedCount / bedCount) * 100) : 0
          },
          createdAt: property.createdAt
        };
      }));
      
      return res.status(200).json({
        success: true,
        properties: propertyData,
        pagination: {
          total: totalProperties,
          page,
          limit,
          pages: Math.ceil(totalProperties / limit)
        }
      });
    } catch (error) {
      console.error('Get all properties error:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  },
  
  /**
   * Get detailed information about a specific property
   * @route GET /api/admin/properties/:id
   */
  getPropertyDetails: async (req, res) => {
    try {
      const propertyId = req.params.id;
      
      if (!mongoose.Types.ObjectId.isValid(propertyId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid property ID format'
        });
      }
      
      // Get property with populated landlord info
      const property = await Property.findById(propertyId)
        .populate('landlordId', 'name email mobile profilePhoto')
        .select('-__v');
      
      if (!property) {
        return res.status(404).json({
          success: false,
          message: 'Property not found'
        });
      }
      
      // Get all rooms for this property
      const rooms = await Room.find({ propertyId: propertyId })
        .select('roomNumber isActive type price beds createdAt');
      
      // Get bed details for each room
      const roomDetails = await Promise.all(rooms.map(async (room) => {
        // Get beds for this room
        const beds = await Bed.find({ roomId: room._id })
          .select('bedNumber isOccupied isActive tenantId price');
        
        // Map beds with tenant info
        const bedDetails = beds.map(bed => ({
          id: bed._id,
          bedNumber: bed.bedNumber,
          isOccupied: bed.isOccupied,
          isActive: bed.isActive,
          tenantId: bed.tenantId,
          price: bed.price
        }));
        
        return {
          id: room._id,
          roomNumber: room.roomNumber,
          isActive: room.isActive,
          type: room.type,
          price: room.price,
          bedCount: beds.length,
          occupiedBedCount: beds.filter(bed => bed.isOccupied).length,
          beds: bedDetails,
          createdAt: room.createdAt
        };
      }));
      
      // Calculate property stats
      const totalRooms = roomDetails.length;
      const activeRooms = roomDetails.filter(room => room.isActive).length;
      const totalBeds = roomDetails.reduce((sum, room) => sum + room.bedCount, 0);
      const occupiedBeds = roomDetails.reduce((sum, room) => sum + room.occupiedBedCount, 0);
      
      // Prepare response
      const propertyDetails = {
        id: property._id,
        name: property.name,
        address: property.address,
        city: property.city,
        state: property.state,
        pinCode: property.pinCode,
        isActive: property.isActive,
        landlord: property.landlordId ? {
          id: property.landlordId._id,
          name: property.landlordId.name,
          email: property.landlordId.email,
          mobile: property.landlordId.mobile,
          profilePhoto: property.landlordId.profilePhoto
        } : null,
        stats: {
          totalRooms,
          activeRooms,
          totalBeds,
          occupiedBeds,
          occupancyRate: totalBeds ? Math.round((occupiedBeds / totalBeds) * 100) : 0
        },
        facilities: property.facilities || [],
        images: property.images || [],
        rooms: roomDetails,
        createdAt: property.createdAt
      };
      
      return res.status(200).json({
        success: true,
        property: propertyDetails
      });
    } catch (error) {
      console.error('Get property details error:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  },
  
  /**
   * Toggle property active status
   * @route PATCH /api/admin/properties/:id/toggle-status
   */
  togglePropertyStatus: async (req, res) => {
    try {
      const propertyId = req.params.id;
      
      if (!mongoose.Types.ObjectId.isValid(propertyId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid property ID format'
        });
      }
      
      // Get property
      const property = await Property.findById(propertyId);
      
      if (!property) {
        return res.status(404).json({
          success: false,
          message: 'Property not found'
        });
      }
      
      // Toggle isActive status
      property.isActive = !property.isActive;
      
      await property.save();
      
      return res.status(200).json({
        success: true,
        message: `Property ${property.isActive ? 'activated' : 'deactivated'} successfully`,
        isActive: property.isActive
      });
    } catch (error) {
      console.error('Toggle property status error:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  },
  
  /**
   * Toggle room active status
   * @route PATCH /api/admin/rooms/:id/toggle-status
   */
  toggleRoomStatus: async (req, res) => {
    try {
      const roomId = req.params.id;
      
      if (!mongoose.Types.ObjectId.isValid(roomId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid room ID format'
        });
      }
      
      // Get room
      const room = await Room.findById(roomId);
      
      if (!room) {
        return res.status(404).json({
          success: false,
          message: 'Room not found'
        });
      }
      
      // Toggle isActive status
      room.isActive = !room.isActive;
      
      await room.save();
      
      return res.status(200).json({
        success: true,
        message: `Room ${room.isActive ? 'activated' : 'deactivated'} successfully`,
        isActive: room.isActive
      });
    } catch (error) {
      console.error('Toggle room status error:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  },
  
  /**
   * Toggle bed active status
   * @route PATCH /api/admin/beds/:id/toggle-status
   */
  toggleBedStatus: async (req, res) => {
    try {
      const bedId = req.params.id;
      
      if (!mongoose.Types.ObjectId.isValid(bedId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid bed ID format'
        });
      }
      
      // Get bed
      const bed = await Bed.findById(bedId);
      
      if (!bed) {
        return res.status(404).json({
          success: false,
          message: 'Bed not found'
        });
      }
      
      // Toggle isActive status
      bed.isActive = !bed.isActive;
      
      await bed.save();
      
      return res.status(200).json({
        success: true,
        message: `Bed ${bed.isActive ? 'activated' : 'deactivated'} successfully`,
        isActive: bed.isActive
      });
    } catch (error) {
      console.error('Toggle bed status error:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  }
};

module.exports = adminPropertyController;
