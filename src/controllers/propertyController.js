// Property add, update, list
const Property = require('../models/Property');
const mongoose = require('mongoose');
const { setCache, getCache } = require('../utils/redis');
const statusManagement = require('../services/statusManagement');
const idGenerator = require('../services/idGenerator');

/**
 * Add a new property with standardized ID format
 */
const addProperty = async (req, res) => {
  try {
    const {
      name,
      type,
      address,
      pinCode,
      city,
      state,
      landmark,
      contactNumber,
      ownerName,
      description,
      images,
      rooms
    } = req.body;

    // Validate required fields
    if (!name || !type || !address) {
      return res.status(400).json({ message: 'Property name, type, and address are required' });
    }

    const landlordId = req.user.id;

    // Generate a standardized property ID
    const propertyId = await idGenerator.generatePropertyId();

    // Create new property
    const property = new Property({
      landlordId,
      name,
      type,
      address,
      pinCode,
      city,
      state,
      landmark,
      contactNumber,
      ownerName,
      description,
      images: images || [],
      totalCapacity: 0,
      propertyId, // Add standardized property ID
      status: 'Available'
    });

    // Add rooms if provided
    if (rooms && Array.isArray(rooms) && rooms.length > 0) {
      // Calculate total capacity from rooms
      let capacity = 0;
      property.totalRooms = rooms.length;
      let bedCount = 0;

      // Process each room
      rooms.forEach(room => {
        // Ensure room has required fields
        if (room.type && room.price) {
          const newRoom = {
            roomId: `ROOM-${Math.random().toString(36).substr(2, 9)}`,
            type: room.type,
            price: room.price,
            capacity: room.capacity || 1,
            status: room.status || 'Available',
            beds: [],
            tenants: [],
            facilities: room.facilities || {}
          };
          
          // Properly handle all facility categories
          const facilityCategories = [
            'roomEssentials', 'comfortFeatures', 'washroomHygiene', 
            'utilitiesConnectivity', 'laundryHousekeeping', 
            'securitySafety', 'parkingTransport', 
            'propertySpecific', 'nearbyFacilities'
          ];
          
          facilityCategories.forEach(category => {
            if (room.facilities && room.facilities[category]) {
              if (!newRoom.facilities[category]) {
                newRoom.facilities[category] = {};
              }
              Object.keys(room.facilities[category]).forEach(key => {
                newRoom.facilities[category][key] = room.facilities[category][key];
              });
            }
          });

          // Add beds if provided
          if (room.beds && Array.isArray(room.beds) && room.beds.length > 0) {
            room.beds.forEach(bed => {
              if (bed.price) {
                newRoom.beds.push({
                  bedId: `BED-${Math.random().toString(36).substr(2, 9)}`,
                  status: bed.status || 'Available',
                  price: bed.price,
                  monthlyCollection: 0,
                  pendingDues: 0,
                  tenants: []
                });
              }
            });
            bedCount += newRoom.beds.length;
          }

          // Update capacity
          capacity += newRoom.capacity;
          property.rooms.push(newRoom);
        }
      });

      property.totalCapacity = capacity;
      property.totalBeds = bedCount;
    }

    await property.save();

    // Clear cache for property listings
    await setCache(`properties:${landlordId}`, null);

    // Convert to a plain object to make it easier to modify
    const propertyResponse = property.toObject();
    
    res.status(201).json({ 
      success: true,
      message: 'Property added successfully', 
      property: {
        id: property._id,
        propertyId: property.propertyId, // Standardized property ID
        name: property.name,
        type: property.type,
        address: property.address,
        pinCode: property.pinCode || "",
        city: property.city || "",
        state: property.state || "",
        contactNumber: property.contactNumber || "",
        ownerName: property.ownerName || "",
        description: property.description || "",
        totalRooms: property.totalRooms || 0,
        totalBeds: property.totalBeds || 0,
        totalCapacity: property.totalCapacity || 0,
        rooms: property.rooms,
        images: property.images || [],
        createdAt: property.createdAt,
        updatedAt: property.updatedAt
      }
    });
  } catch (error) {
    console.error('Error in addProperty:', error);
    res.status(500).json({ message: 'Error adding property', error: error.message });
  }
};

/**
 * Get all properties for a landlord
 */
const getProperties = async (req, res) => {
  try {
    const landlordId = req.user.id;
    const cacheKey = `properties:${landlordId}`;
    const cachedProperties = await getCache(cacheKey);

    if (cachedProperties) {
      return res.status(200).json(cachedProperties);
    }

    const properties = await Property.find({ landlordId });
    
    // Add summary information
    const propertiesWithSummary = properties.map(property => {
      const propertyObj = property.toObject();
      
      // Calculate occupancy rate
      const totalRooms = propertyObj.rooms.length;
      const occupiedRooms = propertyObj.rooms.filter(room => room.status === 'Not Available').length;
      const occupancyRate = totalRooms > 0 ? (occupiedRooms / totalRooms) * 100 : 0;
      
      // Calculate total monthly collection
      let totalMonthlyCollection = 0;
      propertyObj.rooms.forEach(room => {
        totalMonthlyCollection += room.monthlyCollection || 0;
        if (room.beds && room.beds.length > 0) {
          room.beds.forEach(bed => {
            totalMonthlyCollection += bed.monthlyCollection || 0;
          });
        }
      });
      
      // Add summary data
      propertyObj.summary = {
        totalRooms,
        occupiedRooms,
        occupancyRate: Math.round(occupancyRate),
        totalMonthlyCollection,
        pendingDues: propertyObj.pendingDues || 0
      };
      
      return propertyObj;
    });
    
    await setCache(cacheKey, propertiesWithSummary);

    res.status(200).json({
      success: true,
      count: propertiesWithSummary.length,
      properties: propertiesWithSummary.map(property => ({
        id: property._id,
        propertyId: property.propertyId, // Ensuring standardized ID is present
        name: property.name,
        type: property.type,
        address: property.address,
        status: property.status,
        rooms: property.rooms,
        summary: property.summary
      }))
    });
  } catch (error) {
    console.error('Error in getProperties:', error);
    res.status(500).json({ message: 'Error fetching properties', error: error.message });
  }
};

/**
 * Get property by ID
 */
const getPropertyById = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const landlordId = req.user.id;
    
    const property = await Property.findOne({ 
      _id: propertyId,
      landlordId
    });
    
    if (!property) {
      return res.status(404).json({ message: 'Property not found or you do not have access' });
    }
    
    // Add occupancy rate and other metrics
    const propertyObj = property.toObject();
    
    // Calculate room occupancy
    const totalRooms = propertyObj.rooms.length;
    const occupiedRooms = propertyObj.rooms.filter(room => room.status === 'Not Available').length;
    const roomOccupancyRate = totalRooms > 0 ? (occupiedRooms / totalRooms) * 100 : 0;
    
    // Calculate bed occupancy
    let totalBeds = 0;
    let occupiedBeds = 0;
    propertyObj.rooms.forEach(room => {
      if (room.beds && room.beds.length > 0) {
        totalBeds += room.beds.length;
        occupiedBeds += room.beds.filter(bed => bed.status === 'Not Available').length;
      }
    });
    const bedOccupancyRate = totalBeds > 0 ? (occupiedBeds / totalBeds) * 100 : 0;
    
    // Add metrics
    propertyObj.metrics = {
      totalRooms,
      occupiedRooms,
      availableRooms: totalRooms - occupiedRooms,
      roomOccupancyRate: Math.round(roomOccupancyRate),
      totalBeds,
      occupiedBeds,
      availableBeds: totalBeds - occupiedBeds,
      bedOccupancyRate: Math.round(bedOccupancyRate),
      monthlyCollection: property.monthlyCollection || 0,
      pendingDues: property.pendingDues || 0
    };
    
    // Ensure the propertyId is prominently featured in the response
    res.status(200).json({
      success: true,
      property: {
        id: propertyObj._id,
        propertyId: propertyObj.propertyId, // Highlighting the standardized ID
        name: propertyObj.name,
        type: propertyObj.type,
        address: propertyObj.address,
        status: propertyObj.status,
        rooms: propertyObj.rooms.map(room => ({
          ...room,
          roomId: room.roomId, // Ensuring room ID is present
          beds: (room.beds || []).map(bed => ({
            ...bed,
            bedId: bed.bedId // Ensuring bed ID is present
          }))
        })),
        metrics: propertyObj.metrics
      }
    });
  } catch (error) {
    console.error('Error in getPropertyById:', error);
    res.status(500).json({ message: 'Error fetching property', error: error.message });
  }
};

/**
 * Update a property's basic information
 */
const updateProperty = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const updateData = req.body;
    const landlordId = req.user.id;

    // Find property and ensure it belongs to this landlord
    const property = await Property.findOne({
      _id: propertyId,
      landlordId
    });

    if (!property) {
      return res.status(404).json({ message: 'Property not found or you do not have access' });
    }

    // Update all top-level property fields if provided (including blank/empty values)
    const topLevelFields = [
      'name', 'type', 'address', 'pinCode', 'city', 'state',
      'landmark', 'contactNumber', 'ownerName', 'description', 'images',
      'totalRooms', 'totalBeds', 'totalCapacity', 'monthlyCollection', 'pendingDues', 'occupiedSpace'
    ];
    topLevelFields.forEach(field => {
      if (updateData.hasOwnProperty(field)) {
        property[field] = updateData[field];
      }
    });

    // If rooms are provided, update/replace rooms array
    if (updateData.rooms && Array.isArray(updateData.rooms)) {
      property.rooms = [];
      let totalBeds = 0;
      let totalCapacity = 0;
      updateData.rooms.forEach(room => {
        if (room.type && room.price) {
          const newRoom = {
            roomId: room.roomId || `ROOM-${Math.random().toString(36).substr(2, 9)}`,
            type: room.type,
            price: room.price,
            capacity: room.capacity || 1,
            status: room.status || 'Available',
            beds: [],
            tenants: room.tenants || [],
            facilities: room.facilities || {}
          };
          // Facilities categories
          const facilityCategories = [
            'roomEssentials', 'comfortFeatures', 'washroomHygiene',
            'utilitiesConnectivity', 'laundryHousekeeping',
            'securitySafety', 'parkingTransport',
            'propertySpecific', 'nearbyFacilities'
          ];
          facilityCategories.forEach(category => {
            if (room.facilities && room.facilities[category]) {
              if (!newRoom.facilities[category]) {
                newRoom.facilities[category] = {};
              }
              Object.keys(room.facilities[category]).forEach(key => {
                newRoom.facilities[category][key] = room.facilities[category][key];
              });
            }
          });
          // Beds
          if (room.beds && Array.isArray(room.beds)) {
            room.beds.forEach(bed => {
              if (bed.price) {
                newRoom.beds.push({
                  bedId: bed.bedId || `BED-${Math.random().toString(36).substr(2, 9)}`,
                  status: bed.status || 'Available',
                  price: bed.price,
                  monthlyCollection: bed.monthlyCollection || 0,
                  pendingDues: bed.pendingDues || 0,
                  tenants: bed.tenants || []
                });
              }
            });
            totalBeds += newRoom.beds.length;
          }
          totalCapacity += newRoom.capacity;
          property.rooms.push(newRoom);
        }
      });
      property.totalRooms = property.rooms.length;
      property.totalBeds = totalBeds;
      property.totalCapacity = totalCapacity;
    }

    property.updatedAt = new Date();
    await property.save();

    // Clear cache
    await setCache(`properties:${landlordId}`, null);

    // Return the full updated property details
    res.status(200).json({
      message: 'Property updated successfully',
      property: {
        id: property._id,
        propertyId: property.propertyId,
        name: property.name,
        type: property.type,
        address: property.address,
        pinCode: property.pinCode || "",
        city: property.city || "",
        state: property.state || "",
        contactNumber: property.contactNumber || "",
        ownerName: property.ownerName || "",
        description: property.description || "",
        totalRooms: property.totalRooms || 0,
        totalBeds: property.totalBeds || 0,
        totalCapacity: property.totalCapacity || 0,
        rooms: property.rooms,
        images: property.images || [],
        createdAt: property.createdAt,
        updatedAt: property.updatedAt
      }
    });
  } catch (error) {
    console.error('Error in updateProperty:', error);
    res.status(500).json({ message: 'Error updating property', error: error.message });
  }
};

/**
 * Delete a property
 */
/**
 * Enhanced property deletion controller
 * - Validates property ownership
 * - Checks for active tenants
 * - Performs proper deletion with statistics
 * - Handles errors gracefully
 */
const deleteProperty = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const landlordId = req.user.id;
    
    console.log(`Attempting to delete property ${propertyId} for landlord ${landlordId}`);
    
    // Find property and ensure it belongs to this landlord
    const property = await Property.findOne({ 
      _id: propertyId, 
      landlordId
    });
    
    if (!property) {
      return res.status(404).json({ 
        success: false,
        message: 'Property not found or you do not have access',
        error: 'PROPERTY_NOT_FOUND'
      });
    }
    
    // Collect property stats before deletion for response
    const propertyStats = {
      name: property.name,
      propertyId: property.propertyId,
      totalRooms: property.rooms.length,
      totalBeds: property.totalBeds || 0
    };
    
    // Check if property has active tenants
    let hasTenants = false;
    let tenantCount = 0;
    
    property.rooms.forEach(room => {
      if (room.tenants && room.tenants.length > 0) {
        hasTenants = true;
        tenantCount += room.tenants.length;
      }
      if (room.beds) {
        room.beds.forEach(bed => {
          if (bed.tenants && bed.tenants.length > 0) {
            hasTenants = true;
            tenantCount += bed.tenants.length;
          }
        });
      }
    });
    
    if (hasTenants) {
      return res.status(400).json({ 
        success: false,
        message: 'Cannot delete property with active tenants. Please remove all tenants first.',
        error: 'ACTIVE_TENANTS',
        tenantCount: tenantCount
      });
    }
    
    // Perform the actual deletion
    const deleteResult = await Property.deleteOne({ _id: propertyId });
    
    if (deleteResult.deletedCount === 0) {
      return res.status(500).json({ 
        success: false,
        message: 'Failed to delete property',
        error: 'DELETE_FAILED'
      });
    }
    
    // Clear cache
    await setCache(`properties:${landlordId}`, null);
    
    res.status(200).json({ 
      success: true,
      message: 'Property deleted successfully',
      deletedProperty: propertyStats
    });
  } catch (error) {
    console.error('Error in deleteProperty:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error deleting property', 
      error: error.message 
    });
  }
};

// Import room and bed management functions from propertyRooms module
const propertyRooms = require('./propertyRooms');

// Import property statistics functions from propertyStats module
const propertyStats = require('./propertyStats');

module.exports = {
  // Property core functions
  addProperty,
  getProperties,
  getPropertyById,
  updateProperty,
  deleteProperty,

  // Room management functions
  addRoomToProperty: propertyRooms.addRoomToProperty,
  updateRoom: propertyRooms.updateRoom,
  deleteRoom: propertyRooms.deleteRoom,
  
  // Bed management functions
  addBedToRoom: propertyRooms.addBedToRoom,
  updateBed: propertyRooms.updateBed,
  deleteBed: propertyRooms.deleteBed,
  
  // Statistics and availability functions
  getPropertyOccupancy: propertyStats.getPropertyOccupancy,
  getPropertyRentCollection: propertyStats.getPropertyRentCollection,
  getPropertyDues: propertyStats.getPropertyDues,
  searchProperties: propertyStats.searchProperties,
  getPropertiesByType: propertyStats.getPropertiesByType,
  getAvailableRooms: propertyStats.getAvailableRooms,
  getAvailableBeds: propertyStats.getAvailableBeds
};