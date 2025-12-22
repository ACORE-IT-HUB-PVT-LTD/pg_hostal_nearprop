const Property = require('../models/Property');
const { validateBedAvailability } = require('../utils/bedValidation');

/**
 * Get available rooms and beds for tenant assignment
 * Returns rooms with their types and availability status
 */
const getAvailableRoomsAndBeds = async (req, res) => {
  const { propertyId } = req.params;
  
  try {
    // Verify the property belongs to this landlord
    const property = await Property.findOne({ 
      _id: propertyId,
      landlordId: req.user.id
    });
    
    if (!property) {
      return res.status(404).json({ message: 'Property not found or you do not have access' });
    }
    
    // Build a structured response with room types and available beds
    const roomsInfo = property.rooms.map(room => {
      // Check each bed's availability
      const bedsInfo = room.beds.map(bed => {
        const bedValidation = validateBedAvailability(bed);
        return {
          bedId: bed.bedId,
          name: bed.name,
          price: bed.price,
          isAvailable: bedValidation.isAvailable,
          status: bed.status,
          occupiedBy: bedValidation.occupiedBy || null
        };
      });
      
      // Calculate room occupancy
      const totalBeds = room.beds.length;
      const occupiedBeds = room.beds.filter(bed => bed.status !== 'Available').length;
      const availableBeds = totalBeds - occupiedBeds;
      
      // Get room capacity based on type
      let capacity = 1; // Default
      if (room.type === 'Double Sharing') capacity = 2;
      else if (room.type === 'Triple Sharing') capacity = 3;
      else if (room.type === 'Four Sharing') capacity = 4;
      else if (room.type === 'Five Sharing') capacity = 5;
      else if (room.type === 'Six Sharing') capacity = 6;
      else if (room.type === 'More Than 6 Sharing') capacity = 10; // Approximate
      
      const tenantCount = room.tenants ? room.tenants.length : 0;
      const hasCapacity = tenantCount < capacity;
      
      return {
        roomId: room.roomId,
        name: room.name,
        type: room.type,
        price: room.price,
        capacity,
        currentOccupancy: tenantCount,
        hasCapacity,
        availableBeds,
        totalBeds,
        beds: bedsInfo.sort((a, b) => a.isAvailable === b.isAvailable ? 0 : a.isAvailable ? -1 : 1) // Sort available beds first
      };
    });
    
    res.status(200).json({
      propertyId: property._id,
      propertyName: property.name,
      roomTypes: [
        'Single Sharing', 'Double Sharing', 'Triple Sharing', 'Four Sharing', 
        'Five Sharing', 'Six Sharing', 'More Than 6 Sharing', 'Private Room', 
        'Shared Room', 'Couple', 'Family', 'Male Only', 'Female Only', 
        'Unisex', 'Student Only', 'Working Professionals Only', 'PG', 'AC'
      ],
      rooms: roomsInfo
    });
    
  } catch (error) {
    console.error('Error in getAvailableRoomsAndBeds:', error);
    res.status(500).json({ message: 'Error fetching rooms and beds', error: error.message });
  }
};

module.exports = {
  getAvailableRoomsAndBeds
};
