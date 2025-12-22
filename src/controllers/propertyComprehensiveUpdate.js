const Property = require('../models/Property');
const { setCache } = require('../utils/redis');

/**
 * Update a property with comprehensive options
 * This controller allows updating all aspects of a property, including
 * the property itself, rooms, beds, and all facilities
 */
const updatePropertyComprehensive = async (req, res) => {
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
    
    // 1. Update property-level fields
    const propertyFields = [
      'name', 'type', 'address', 'pinCode', 'city', 'state', 
      'landmark', 'contactNumber', 'ownerName', 'description', 
      'images', 'totalRooms', 'totalBeds'
    ];
    
    propertyFields.forEach(field => {
      if (updateData[field] !== undefined) {
        property[field] = updateData[field];
      }
    });
    
    // 2. Update existing rooms
    if (updateData.rooms && Array.isArray(updateData.rooms)) {
      updateData.rooms.forEach(roomUpdate => {
        // Only process rooms with roomId (existing rooms)
        if (roomUpdate.roomId) {
          const roomIndex = property.rooms.findIndex(r => r.roomId === roomUpdate.roomId);
          
          if (roomIndex !== -1) {
            const existingRoom = property.rooms[roomIndex];
            
            // Update room fields
            const roomFields = [
              'type', 'status', 'price', 'capacity', 'floorNumber', 
              'roomSize', 'securityDeposit', 'noticePeriod'
            ];
            
            roomFields.forEach(field => {
              if (roomUpdate[field] !== undefined) {
                existingRoom[field] = roomUpdate[field];
              }
            });
            
            // Update facilities if provided
            if (roomUpdate.facilities) {
              if (!existingRoom.facilities) {
                existingRoom.facilities = {};
              }
              
              // Update each facility category
              const facilityCategories = [
                'roomEssentials', 'comfortFeatures', 'washroomHygiene', 
                'utilitiesConnectivity', 'laundryHousekeeping', 
                'securitySafety', 'parkingTransport', 
                'propertySpecific', 'nearbyFacilities'
              ];
              
              facilityCategories.forEach(category => {
                if (roomUpdate.facilities[category]) {
                  if (!existingRoom.facilities[category]) {
                    existingRoom.facilities[category] = {};
                  }
                  
                  // Update each field in the category
                  Object.keys(roomUpdate.facilities[category]).forEach(field => {
                    existingRoom.facilities[category][field] = roomUpdate.facilities[category][field];
                  });
                }
              });
            }
            
            // Update existing beds or add new beds
            if (roomUpdate.beds && Array.isArray(roomUpdate.beds)) {
              roomUpdate.beds.forEach(bedUpdate => {
                if (bedUpdate.bedId) {
                  // Update existing bed
                  const bedIndex = existingRoom.beds.findIndex(b => b.bedId === bedUpdate.bedId);
                  
                  if (bedIndex !== -1) {
                    const existingBed = existingRoom.beds[bedIndex];
                    
                    // Update bed fields
                    const bedFields = ['status', 'price'];
                    bedFields.forEach(field => {
                      if (bedUpdate[field] !== undefined) {
                        existingBed[field] = bedUpdate[field];
                      }
                    });
                  }
                } else {
                  // Add new bed
                  existingRoom.beds.push({
                    bedId: `BED-${Math.random().toString(36).substr(2, 9)}`,
                    status: bedUpdate.status || 'Available',
                    price: bedUpdate.price,
                    monthlyCollection: 0,
                    pendingDues: 0,
                    tenants: []
                  });
                }
              });
            }
          }
        } else {
          // Add new room
          const newRoom = {
            roomId: `ROOM-${Math.random().toString(36).substr(2, 9)}`,
            type: roomUpdate.type,
            status: roomUpdate.status || 'Available',
            price: roomUpdate.price,
            capacity: roomUpdate.capacity || 1,
            floorNumber: roomUpdate.floorNumber,
            roomSize: roomUpdate.roomSize,
            securityDeposit: roomUpdate.securityDeposit || 0,
            noticePeriod: roomUpdate.noticePeriod || 30,
            monthlyCollection: 0,
            pendingDues: 0,
            beds: [],
            tenants: [],
            facilities: roomUpdate.facilities || {}
          };
          
          // Add beds if provided
          if (roomUpdate.beds && Array.isArray(roomUpdate.beds)) {
            roomUpdate.beds.forEach(bed => {
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
          }
          
          property.rooms.push(newRoom);
        }
      });
    }
    
    // Handle deletions if specified
    if (updateData.deleteRooms && Array.isArray(updateData.deleteRooms)) {
      updateData.deleteRooms.forEach(roomId => {
        const roomIndex = property.rooms.findIndex(r => r.roomId === roomId);
        if (roomIndex !== -1) {
          const room = property.rooms[roomIndex];
          
          // Check if room has active tenants
          const hasTenants = room.tenants && room.tenants.length > 0;
          const hasBedTenants = room.beds && room.beds.some(bed => bed.tenants && bed.tenants.length > 0);
          
          if (!hasTenants && !hasBedTenants) {
            // Safe to remove
            property.rooms.splice(roomIndex, 1);
          }
        }
      });
    }
    
    if (updateData.deleteBeds && Array.isArray(updateData.deleteBeds)) {
      updateData.deleteBeds.forEach(({ roomId, bedId }) => {
        const roomIndex = property.rooms.findIndex(r => r.roomId === roomId);
        if (roomIndex !== -1) {
          const room = property.rooms[roomIndex];
          const bedIndex = room.beds.findIndex(b => b.bedId === bedId);
          
          if (bedIndex !== -1) {
            const bed = room.beds[bedIndex];
            
            // Check if bed has active tenants
            if (!bed.tenants || bed.tenants.length === 0) {
              // Safe to remove
              room.beds.splice(bedIndex, 1);
            }
          }
        }
      });
    }
    
    // Update timestamps
    property.updatedAt = new Date();
    
    // Calculate and update total counts
    property.totalRooms = property.rooms.length;
    
    let totalBeds = 0;
    property.rooms.forEach(room => {
      if (room.beds) {
        totalBeds += room.beds.length;
      }
    });
    property.totalBeds = totalBeds;
    
    await property.save();
    
    // Clear cache
    await setCache(`properties:${landlordId}`, null);
    
    res.status(200).json({ 
      message: 'Property updated successfully',
      property: {
        propertyId: property.propertyId,
        name: property.name,
        updatedAt: property.updatedAt,
        totalRooms: property.totalRooms,
        totalBeds: property.totalBeds
      }
    });
  } catch (error) {
    console.error('Error in updatePropertyComprehensive:', error);
    res.status(500).json({ message: 'Error updating property', error: error.message });
  }
};

module.exports = {
  updatePropertyComprehensive
};
