const Property = require('../models/Property');
const { setCache } = require('../utils/redis');

/**
 * Update the facilities for a room in a property
 */
const updateRoomFacilities = async (req, res) => {
  try {
    const { propertyId, roomId } = req.params;
    const facilitiesData = req.body;
    
    // Find property
    const property = await Property.findOne({
      _id: propertyId,
      landlordId: req.user.id
    });
    
    if (!property) {
      return res.status(404).json({ message: 'Property not found or you do not have access' });
    }
    
    // Find room in property
    const roomIndex = property.rooms.findIndex(r => r.roomId === roomId);
    if (roomIndex === -1) {
      return res.status(404).json({ message: 'Room not found in this property' });
    }
    
    const room = property.rooms[roomIndex];
    
    // Initialize facilities object if it doesn't exist
    if (!room.facilities) {
      room.facilities = {};
    }
    
    // Update each facilities category if provided
    const facilityCategories = [
      'roomEssentials',
      'comfortFeatures',
      'washroomHygiene',
      'utilitiesConnectivity',
      'laundryHousekeeping',
      'securitySafety',
      'parkingTransport',
      'propertySpecific',
      'nearbyFacilities'
    ];
    
    facilityCategories.forEach(category => {
      if (facilitiesData[category]) {
        if (!room.facilities[category]) {
          room.facilities[category] = {};
        }
        
        // Update each field in the category
        Object.keys(facilitiesData[category]).forEach(field => {
          room.facilities[category][field] = facilitiesData[category][field];
        });
      }
    });
    
    property.updatedAt = new Date();
    await property.save();
    
    // Clear cache
    await setCache(`properties:${req.user.id}`, null);
    
    res.status(200).json({
      message: 'Room facilities updated successfully',
      facilities: room.facilities
    });
  } catch (error) {
    console.error('Error in updateRoomFacilities:', error);
    res.status(500).json({ message: 'Error updating room facilities', error: error.message });
  }
};

/**
 * Update the facilities for an entire property
 */
const updatePropertyFacilities = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const { defaultFacilities } = req.body;
    
    if (!defaultFacilities) {
      return res.status(400).json({ message: 'Default facilities are required' });
    }
    
    // Find property
    const property = await Property.findOne({
      _id: propertyId,
      landlordId: req.user.id
    });
    
    if (!property) {
      return res.status(404).json({ message: 'Property not found or you do not have access' });
    }
    
    // Apply default facilities to all rooms without specific facilities
    property.rooms.forEach(room => {
      if (!room.facilities) {
        room.facilities = JSON.parse(JSON.stringify(defaultFacilities)); // Deep clone
      } else {
        // For each category in defaultFacilities
        Object.keys(defaultFacilities).forEach(category => {
          if (!room.facilities[category]) {
            room.facilities[category] = {};
          }
          
          // For each field in the category, set default if not already set
          Object.keys(defaultFacilities[category]).forEach(field => {
            if (room.facilities[category][field] === undefined) {
              room.facilities[category][field] = defaultFacilities[category][field];
            }
          });
        });
      }
    });
    
    property.updatedAt = new Date();
    await property.save();
    
    // Clear cache
    await setCache(`properties:${req.user.id}`, null);
    
    res.status(200).json({
      message: 'Property facilities updated successfully',
      roomsUpdated: property.rooms.length
    });
  } catch (error) {
    console.error('Error in updatePropertyFacilities:', error);
    res.status(500).json({ message: 'Error updating property facilities', error: error.message });
  }
};

module.exports = {
  updateRoomFacilities,
  updatePropertyFacilities
};
