const Property = require('../models/Property');
const mongoose = require('mongoose');
const { setCache, getCache } = require('../utils/redis');
const idGenerator = require('../services/idGenerator');
const statusManagement = require('../services/statusManagement');

/**
 * Add new rooms to a property with support for multiple rooms, beds, and facilities
 */
const addRoomToProperty = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const landlordId = req.user.id;
    
    // Support both single room object and array of rooms
    const roomData = Array.isArray(req.body) ? req.body : [req.body];
    
    // Find property
    const property = await Property.findOne({ 
      _id: propertyId,
      landlordId
    });
    
    if (!property) {
      return res.status(404).json({ message: 'Property not found or you do not have access' });
    }
    
    // Track added rooms and updated property stats
    const addedRooms = [];
    let addedCapacity = 0;
    let addedBeds = 0;
    
    // Process each room in the request
    for (const room of roomData) {
      // Make everything optional except for minimal identification
      // Since we're already inside a property, we just need to create a room
      
      // Create new room with all provided fields (all optional with defaults)
      // Generate standardized room ID based on property ID and room count
      const roomNumber = (property.rooms?.length || 0) + 1;
      
      // Ensure room has a unique name
      let roomName = room.name || `Room ${roomNumber} - ${property.name}`;
      
      // Check if name already exists in the property
      if (property.rooms.some(existingRoom => existingRoom.name === roomName)) {
        console.warn(`Room with name '${roomName}' already exists in this property, generating a unique name instead`);
        // Generate a unique name by appending a timestamp
        const timestamp = new Date().getTime();
        roomName = `${roomName}-${timestamp}`;
      }
      
      const newRoom = {
        name: roomName, // Ensure name is set
        roomId: idGenerator.generateRoomId(property.propertyId, roomNumber),
        type: room.type || "Standard Room",
        price: room.price || 0,
        capacity: room.capacity || 1,
        status: room.status || 'Available',
        floorNumber: room.floorNumber || "",
        roomSize: room.roomSize || "",
        securityDeposit: room.securityDeposit || 0,
        noticePeriod: room.noticePeriod || 0,
        monthlyCollection: room.monthlyCollection || 0,
        pendingDues: room.pendingDues || 0,
        beds: [],
        tenants: room.tenants || [],
        facilities: room.facilities || {}
      };
      
      // Process facility categories
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
      if (room.beds && Array.isArray(room.beds)) {
        let bedIndex = 1; // Counter for generating bed names
        room.beds.forEach(bed => {
          if (bed.price) {
            // Generate a bed ID
            const bedId = `BED-${Math.random().toString(36).substr(2, 9)}`;
            
            // Generate a bed name if not provided
            const bedName = bed.name || `Bed ${bedIndex} - ${roomName}`;
            
            newRoom.beds.push({
              bedId: bedId,
              name: bedName, // Ensure name is set for the bed
              status: bed.status || 'Available',
              price: bed.price,
              monthlyCollection: bed.monthlyCollection || 0,
              pendingDues: bed.pendingDues || 0,
              tenants: bed.tenants || []
            });
            bedIndex++;
          }
        });
        addedBeds += newRoom.beds.length;
      }
      
      // Add room to property
      property.rooms.push(newRoom);
      addedRooms.push(newRoom);
      
      // Track total capacity
      addedCapacity += newRoom.capacity;
    }
    
    // Update property stats
    property.totalRooms = property.rooms.length;
    property.totalCapacity = (property.totalCapacity || 0) + addedCapacity;
    property.totalBeds = (property.totalBeds || 0) + addedBeds;
    property.updatedAt = new Date();
    
    try {
      // Save property with new rooms
      const savedProperty = await property.save();
      
      // Clear cache
      await setCache(`properties:${landlordId}`, null);
      
      // Map added rooms to a simplified format with required fields for response
      const formattedRooms = addedRooms.map(room => ({
        id: room._id,
        name: room.name,
        roomId: room.roomId,
        type: room.type,
        capacity: room.capacity,
        price: room.price,
        status: room.status,
        facilities: room.facilities,
        beds: room.beds.map(bed => ({
          bedId: bed.bedId,
          name: bed.name,
          price: bed.price,
          status: bed.status
        }))
      }));
      
      // Return detailed response
      res.status(201).json({
        success: true,
        message: 'Room added successfully',
        addedRooms: formattedRooms,
        property: {
          id: savedProperty._id,
          propertyId: savedProperty.propertyId,
          name: savedProperty.name,
          totalRooms: savedProperty.totalRooms,
          totalCapacity: savedProperty.totalCapacity,
          totalBeds: savedProperty.totalBeds
        }
      });
    } catch (error) {
      console.error('Error saving property with rooms:', error);
      res.status(500).json({ 
        success: false,
        message: 'Error saving rooms to property', 
        error: error.message 
      });
    }
  } catch (error) {
    console.error('Error in addRoomToProperty:', error);
    res.status(500).json({ message: 'Error adding room', error: error.message });
  }
};

/**
 * Update an existing room with comprehensive support for facilities and beds
 */
const updateRoom = async (req, res) => {
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
      return res.status(404).json({ message: 'Property not found or you do not have access' });
    }
    
    // Find room in property
    const roomIndex = property.rooms.findIndex(r => r.roomId === roomId);
    if (roomIndex === -1) {
      return res.status(404).json({ message: 'Room not found in this property' });
    }
    
    const room = property.rooms[roomIndex];
    const oldCapacity = room.capacity || 1;
    const oldBedsCount = room.beds ? room.beds.length : 0;
    
    // Update all room fields
    const updatableFields = [
      'name', 'type', 'status', 'price', 'capacity', 'floorNumber',
      'roomSize', 'securityDeposit', 'noticePeriod', 'monthlyCollection', 'pendingDues'
    ];
    
    // Check for name uniqueness if name is being updated
    if (updateData.hasOwnProperty('name') && updateData.name !== room.name) {
      // Check if any other room in this property has the same name
      const isDuplicateName = property.rooms.some(
        (r, idx) => idx !== roomIndex && r.name === updateData.name
      );
      
      if (isDuplicateName) {
        // Instead of rejecting, make the name unique by appending a timestamp
        console.warn(`Room with name '${updateData.name}' already exists in this property, generating a unique name instead`);
        const timestamp = new Date().getTime();
        updateData.name = `${updateData.name}-${timestamp}`;
      }
    }

    updatableFields.forEach(field => {
      if (updateData.hasOwnProperty(field)) {
        room[field] = updateData[field];
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
        }
      });
    }
    
    // Handle tenant updates
    if (updateData.tenants) {
      room.tenants = updateData.tenants;
    }
    
    // Handle bed updates
    let totalBedsAfterUpdate = oldBedsCount;
    
    if (updateData.beds && Array.isArray(updateData.beds)) {
      // Replace the beds array completely if provided
      room.beds = [];
      
      // Process each bed
      let bedIndex = 1; // Counter for generating bed names
      updateData.beds.forEach(bed => {
        if (bed.price) {
          // Generate a bed name if not provided
          const bedName = bed.name || `Bed ${bedIndex} - ${room.name || 'Room'}`;
          
          const newBed = {
            bedId: bed.bedId || `BED-${Math.random().toString(36).substr(2, 9)}`,
            name: bedName, // Add name field explicitly
            status: bed.status || 'Available',
            price: bed.price,
            monthlyCollection: bed.monthlyCollection || 0,
            pendingDues: bed.pendingDues || 0,
            tenants: bed.tenants || []
          };
          bedIndex++;
          room.beds.push(newBed);
        }
      });
      
      totalBedsAfterUpdate = room.beds.length;
    }
    
    // Update property stats
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
    
    // Format room data for response to highlight the name field
    const updatedRoom = {
      name: property.rooms[roomIndex].name,  // Ensure name is prominently included 
      roomId: property.rooms[roomIndex].roomId,
      type: property.rooms[roomIndex].type,
      status: property.rooms[roomIndex].status,
      price: property.rooms[roomIndex].price,
      capacity: property.rooms[roomIndex].capacity,
      facilities: property.rooms[roomIndex].facilities,
      beds: property.rooms[roomIndex].beds.map(bed => ({
        bedId: bed.bedId,
        name: bed.name,  // Ensure bed names are included
        status: bed.status,
        price: bed.price
      })),
      // Include other fields as needed
      floorNumber: property.rooms[roomIndex].floorNumber,
      roomSize: property.rooms[roomIndex].roomSize,
      securityDeposit: property.rooms[roomIndex].securityDeposit,
      noticePeriod: property.rooms[roomIndex].noticePeriod
    };
    
    // Send detailed response
    res.status(200).json({
      success: true,
      message: 'Room updated successfully',
      room: updatedRoom,
      propertyStats: {
        id: property._id,
        propertyId: property.propertyId,
        name: property.name,
        totalRooms: property.totalRooms,
        totalBeds: property.totalBeds,
        totalCapacity: property.totalCapacity,
        updatedAt: property.updatedAt
      }
    });
  } catch (error) {
    console.error('Error in updateRoom:', error);
    res.status(500).json({ message: 'Error updating room', error: error.message });
  }
};

/**
 * Delete a room from a property
 */
const deleteRoom = async (req, res) => {
  try {
    const { propertyId, roomId } = req.params;
    
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
    
    // Check if room has active tenants
    if ((room.tenants && room.tenants.length > 0) || 
        (room.beds && room.beds.some(bed => bed.tenants && bed.tenants.length > 0))) {
      return res.status(400).json({ 
        message: 'Cannot delete room with active tenants. Please remove all tenants first.'
      });
    }
    
    // Update total capacity
    property.totalCapacity -= room.capacity || 0;
    
    // Remove room
    property.rooms.splice(roomIndex, 1);
    
    property.updatedAt = new Date();
    await property.save();
    
    // Clear cache
    await setCache(`properties:${req.user.id}`, null);
    
    res.status(200).json({
      message: 'Room deleted successfully'
    });
  } catch (error) {
    console.error('Error in deleteRoom:', error);
    res.status(500).json({ message: 'Error deleting room', error: error.message });
  }
};

/**
 * Add a bed to a room
 */
const addBedToRoom = async (req, res) => {
  try {
    const { propertyId, roomId } = req.params;
    const { price, status } = req.body;
    
    if (!price) {
      return res.status(400).json({ message: 'Bed price is required' });
    }
    
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
    
    // Get the room name for generating bed name
    const roomName = property.rooms[roomIndex].name;
    
    // Generate a bed name
    const bedIndex = property.rooms[roomIndex].beds.length + 1;
    const bedName = req.body.name || `Bed ${bedIndex} - ${roomName}`;
    
    // Create new bed
    const newBed = {
      bedId: `BED-${Math.random().toString(36).substr(2, 9)}`,
      name: bedName, // Add the required name field
      status: status || 'Available',
      price,
      monthlyCollection: 0,
      pendingDues: 0,
      tenants: []
    };
    
    // Add bed to room
    property.rooms[roomIndex].beds.push(newBed);
    
    property.updatedAt = new Date();
    await property.save();
    
    // Clear cache
    await setCache(`properties:${req.user.id}`, null);
    
    res.status(201).json({
      success: true,
      message: 'Bed added successfully',
      bed: {
        bedId: newBed.bedId,
        name: newBed.name,  // Ensure name is included in response
        status: newBed.status,
        price: newBed.price
      }
    });
  } catch (error) {
    console.error('Error in addBedToRoom:', error);
    res.status(500).json({ message: 'Error adding bed', error: error.message });
  }
};

/**
 * Update a bed in a room
 */
const updateBed = async (req, res) => {
  try {
    const { propertyId, roomId, bedId } = req.params;
    const { price, status } = req.body;
    
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
    
    // Find bed in room
    const bedIndex = property.rooms[roomIndex].beds.findIndex(b => b.bedId === bedId);
    if (bedIndex === -1) {
      return res.status(404).json({ message: 'Bed not found in this room' });
    }
    
    // Update bed
    const bed = property.rooms[roomIndex].beds[bedIndex];
    if (price !== undefined) bed.price = price;
    if (status !== undefined) bed.status = status;
    if (req.body.name !== undefined) bed.name = req.body.name;
    
    property.updatedAt = new Date();
    await property.save();
    
    // Clear cache
    await setCache(`properties:${req.user.id}`, null);
    
    res.status(200).json({
      message: 'Bed updated successfully',
      bed: property.rooms[roomIndex].beds[bedIndex]
    });
  } catch (error) {
    console.error('Error in updateBed:', error);
    res.status(500).json({ message: 'Error updating bed', error: error.message });
  }
};

/**
 * Delete a bed from a room
 */
const deleteBed = async (req, res) => {
  try {
    const { propertyId, roomId, bedId } = req.params;
    
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
    
    // Find bed in room
    const bedIndex = property.rooms[roomIndex].beds.findIndex(b => b.bedId === bedId);
    if (bedIndex === -1) {
      return res.status(404).json({ message: 'Bed not found in this room' });
    }
    
    // Check if bed has active tenants
    const bed = property.rooms[roomIndex].beds[bedIndex];
    if (bed.tenants && bed.tenants.length > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete bed with active tenants. Please remove all tenants first.'
      });
    }
    
    // Remove bed
    property.rooms[roomIndex].beds.splice(bedIndex, 1);
    
    property.updatedAt = new Date();
    await property.save();
    
    // Clear cache
    await setCache(`properties:${req.user.id}`, null);
    
    res.status(200).json({
      message: 'Bed deleted successfully'
    });
  } catch (error) {
    console.error('Error in deleteBed:', error);
    res.status(500).json({ message: 'Error deleting bed', error: error.message });
  }
};

module.exports = {
  addRoomToProperty,
  updateRoom,
  deleteRoom,
  addBedToRoom,
  updateBed,
  deleteBed
};
