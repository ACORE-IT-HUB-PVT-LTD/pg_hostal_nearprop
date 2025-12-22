const Property = require('../models/Property');
const mongoose = require('mongoose');
const { setCache, getCache } = require('../utils/redis');

/**
 * Unified controller for room and facilities updates
 * This controller handles both complete room updates and facility-specific updates
 * in a single endpoint
 */
const updateRoomUnified = async (req, res) => {
  try {
    const { propertyId, roomId } = req.params;
    const updateData = req.body;
    const landlordId = req.user.id;
    
    // Find property
    const property = await Property.findOne({
      _id: propertyId,
      landlordId
    });
    
    if (!property) {
      return res.status(404).json({ 
        success: false,
        message: 'Property not found or you do not have access' 
      });
    }
    
    // Find room in property
    const roomIndex = property.rooms.findIndex(r => r.roomId === roomId);
    if (roomIndex === -1) {
      return res.status(404).json({ 
        success: false,
        message: 'Room not found in this property' 
      });
    }
    
    const room = property.rooms[roomIndex];
    const oldCapacity = room.capacity || 1;
    const oldBedsCount = room.beds ? room.beds.length : 0;
    
    // Track what was updated
    const updates = {
      roomDetails: false,
      facilities: false,
      beds: false,
      tenants: false
    };
    
    // Update basic room fields if provided
    const updatableFields = [
      'type', 'status', 'price', 'capacity', 'floorNumber',
      'roomSize', 'securityDeposit', 'noticePeriod', 'monthlyCollection', 'pendingDues'
    ];
    
    updatableFields.forEach(field => {
      if (updateData.hasOwnProperty(field)) {
        room[field] = updateData[field];
        updates.roomDetails = true;
      }
    });
    
    // Handle facility updates with detailed categories
    if (updateData.facilities) {
      const facilityCategories = [
        'roomEssentials', 'comfortFeatures', 'washroomHygiene', 
        'utilitiesConnectivity', 'laundryHousekeeping', 
        'securitySafety', 'parkingTransport', 
        'propertySpecific', 'nearbyFacilities'
      ];
      
      // Create facilities object if it doesn't exist
      if (!room.facilities) {
        room.facilities = {};
      }
      
      facilityCategories.forEach(category => {
        if (updateData.facilities[category]) {
          if (!room.facilities[category]) {
            room.facilities[category] = {};
          }
          
          // Update the facilities in this category
          Object.keys(updateData.facilities[category]).forEach(key => {
            room.facilities[category][key] = updateData.facilities[category][key];
          });
          updates.facilities = true;
        }
      });
    }
    
    // Handle tenant updates if provided
    if (updateData.tenants) {
      room.tenants = updateData.tenants;
      updates.tenants = true;
    }
    
    // Handle bed updates if provided
    let totalBedsAfterUpdate = oldBedsCount;
    
    if (updateData.beds && Array.isArray(updateData.beds)) {
      // Replace the beds array completely if provided
      room.beds = [];
      
      // Process each bed
      updateData.beds.forEach(bed => {
        if (bed.price) {
          const newBed = {
            bedId: bed.bedId || `BED-${Math.random().toString(36).substr(2, 9)}`,
            status: bed.status || 'Available',
            price: bed.price,
            monthlyCollection: bed.monthlyCollection || 0,
            pendingDues: bed.pendingDues || 0,
            tenants: bed.tenants || []
          };
          room.beds.push(newBed);
        }
      });
      
      totalBedsAfterUpdate = room.beds.length;
      updates.beds = true;
    }
    
    // Update property stats if capacity or beds changed
    if (room.capacity !== oldCapacity) {
      property.totalCapacity = (property.totalCapacity - oldCapacity) + room.capacity;
    }
    
    if (totalBedsAfterUpdate !== oldBedsCount) {
      property.totalBeds = (property.totalBeds - oldBedsCount) + totalBedsAfterUpdate;
    }
    
    property.updatedAt = new Date();
    await property.save();
    
    // Clear cache
    await setCache(`properties:${landlordId}`, null);
    
    // Determine what type of update was performed
    let updateType = "general";
    if (updates.facilities && !updates.roomDetails && !updates.beds && !updates.tenants) {
      updateType = "facilities";
    } else if (updates.beds && !updates.roomDetails && !updates.facilities) {
      updateType = "beds";
    }
    
    // Send appropriate response based on what was updated
    res.status(200).json({
      success: true,
      message: `Room ${updateType === "facilities" ? "facilities" : ""} updated successfully`,
      updateType,
      room: property.rooms[roomIndex],
      propertyStats: {
        id: property._id,
        propertyId: property.propertyId,
        totalRooms: property.totalRooms,
        totalBeds: property.totalBeds,
        totalCapacity: property.totalCapacity,
        updatedAt: property.updatedAt
      }
    });
  } catch (error) {
    console.error('Error in updateRoomUnified:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error updating room', 
      error: error.message 
    });
  }
};

module.exports = {
  updateRoomUnified
};
