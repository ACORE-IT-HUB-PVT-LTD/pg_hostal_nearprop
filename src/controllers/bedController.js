const Property = require('../models/Property');
const mongoose = require('mongoose');
const { setCache } = require('../utils/redis');
const idGenerator = require('../services/idGenerator');
const statusManagement = require('../services/statusManagement');

/**
 * Enhanced controller for adding a bed to a room
 */
const addBedToRoom = async (req, res) => {
  try {
    const { propertyId, roomId } = req.params;
    const { price, status } = req.body;
    const landlordId = req.user.id;
    
    // Validate input
    if (price === undefined || price === null) {
      return res.status(400).json({ 
        success: false,
        message: 'Bed price is required' 
      });
    }
    
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
    
    // Create new bed with standardized ID
    const bedNumber = (property.rooms[roomIndex].beds?.length || 0) + 1;
    const bedName = req.body.name || `Bed ${bedNumber} - ${property.rooms[roomIndex].name || 'Room ' + roomId}`;
    
    const newBed = {
      bedId: idGenerator.generateBedId(property.rooms[roomIndex].roomId, bedNumber),
      name: bedName, // Add name from request or generate a default
      status: status || 'Available',
      price,
      monthlyCollection: 0,
      pendingDues: 0,
      tenants: []
    };
    
    // Add bed to room
    if (!property.rooms[roomIndex].beds) {
      property.rooms[roomIndex].beds = [];
    }
    
    property.rooms[roomIndex].beds.push(newBed);
    
    // Update property statistics
    property.totalBeds = (property.totalBeds || 0) + 1;
    property.updatedAt = new Date();
    
    await property.save();
    
    // Clear cache
    await setCache(`properties:${landlordId}`, null);
    
    // Send success response
    res.status(201).json({
      success: true,
      message: 'Bed added successfully',
      bed: {
        bedId: newBed.bedId, // Standardized bed ID
        name: newBed.name || `Bed ${bedNumber}`,
        price: newBed.price,
        status: newBed.status
      }
    });
  } catch (error) {
    console.error('Error in addBedToRoom:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error adding bed', 
      error: error.message 
    });
  }
};

/**
 * Enhanced controller for updating a bed
 */
const updateBed = async (req, res) => {
  try {
    const { propertyId, roomId, bedId } = req.params;
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
    
    // Find bed in room
    if (!property.rooms[roomIndex].beds) {
      return res.status(404).json({ 
        success: false,
        message: 'No beds found in this room' 
      });
    }
    
    const bedIndex = property.rooms[roomIndex].beds.findIndex(b => b.bedId === bedId);
    if (bedIndex === -1) {
      return res.status(404).json({ 
        success: false,
        message: 'Bed not found in this room' 
      });
    }
    
    // Update bed fields if provided
    const bed = property.rooms[roomIndex].beds[bedIndex];
    const updatableFields = ['price', 'status', 'monthlyCollection', 'pendingDues'];
    
    // Track what was updated
    let fieldsUpdated = [];
    
    updatableFields.forEach(field => {
      if (updateData.hasOwnProperty(field)) {
        // Validate status enum if updating status
        if (field === 'status' && 
            !['Available', 'Not Available', 'Unavailable', 'Maintenance', 'Reserved'].includes(updateData[field])) {
          return;
        }
        
        bed[field] = updateData[field];
        fieldsUpdated.push(field);
      }
    });
    
    // Handle tenants updates if provided
    if (updateData.tenants) {
      bed.tenants = updateData.tenants;
      fieldsUpdated.push('tenants');
    }
    
    if (fieldsUpdated.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields provided for update'
      });
    }
    
    property.updatedAt = new Date();
    await property.save();
    
    // Clear cache
    await setCache(`properties:${landlordId}`, null);
    
    // Send success response
    res.status(200).json({
      success: true,
      message: 'Bed updated successfully',
      fieldsUpdated,
      bed: property.rooms[roomIndex].beds[bedIndex]
    });
  } catch (error) {
    console.error('Error in updateBed:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error updating bed', 
      error: error.message 
    });
  }
};

/**
 * Enhanced controller for deleting a bed
 */
const deleteBed = async (req, res) => {
  try {
    const { propertyId, roomId, bedId } = req.params;
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
    
    // Find bed in room
    if (!property.rooms[roomIndex].beds || property.rooms[roomIndex].beds.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'No beds found in this room' 
      });
    }
    
    const bedIndex = property.rooms[roomIndex].beds.findIndex(b => b.bedId === bedId);
    if (bedIndex === -1) {
      return res.status(404).json({ 
        success: false,
        message: 'Bed not found in this room' 
      });
    }
    
    // Check if bed has active tenants
    const bed = property.rooms[roomIndex].beds[bedIndex];
    if (bed.tenants && bed.tenants.length > 0) {
      return res.status(400).json({ 
        success: false,
        message: 'Cannot delete bed with active tenants. Please remove all tenants first.'
      });
    }
    
    // Remove bed
    property.rooms[roomIndex].beds.splice(bedIndex, 1);
    
    // Update property statistics
    property.totalBeds = property.totalBeds > 0 ? property.totalBeds - 1 : 0;
    property.updatedAt = new Date();
    
    await property.save();
    
    // Clear cache
    await setCache(`properties:${landlordId}`, null);
    
    // Send success response
    res.status(200).json({
      success: true,
      message: 'Bed deleted successfully',
      room: {
        roomId: property.rooms[roomIndex].roomId,
        bedsRemaining: property.rooms[roomIndex].beds.length
      },
      propertyStats: {
        id: property._id,
        propertyId: property.propertyId,
        totalBeds: property.totalBeds
      }
    });
  } catch (error) {
    console.error('Error in deleteBed:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error deleting bed', 
      error: error.message 
    });
  }
};

module.exports = {
  addBedToRoom,
  updateBed,
  deleteBed
};
