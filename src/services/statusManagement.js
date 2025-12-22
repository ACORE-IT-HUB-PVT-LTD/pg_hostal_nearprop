/**
 * Status Management Service for Properties, Rooms, and Beds
 * This service handles all operations related to updating availability status
 */

const Property = require('../models/Property');
const mongoose = require('mongoose');
const { setCache } = require('../utils/redis');

// Valid statuses for each entity type
const VALID_STATUSES = {
  property: ['Available', 'Not Available', 'Under Maintenance', 'Reserved', 'Partially Available'],
  room: ['Available', 'Not Available', 'Partially Available', 'Under Maintenance', 'Reserved'],
  bed: ['Available', 'Not Available', 'Unavailable', 'Maintenance', 'Reserved', 'Occupied']
};

/**
 * Update the status of a property
 * @param {String} propertyId - The ID of the property
 * @param {String} landlordId - The ID of the landlord
 * @param {String} status - The new status
 * @param {String} notes - Optional notes about the status change
 */
const updatePropertyStatus = async (propertyId, landlordId, status, notes = '') => {
  // Validate status
  if (!VALID_STATUSES.property.includes(status)) {
    throw new Error(`Invalid property status. Valid statuses are: ${VALID_STATUSES.property.join(', ')}`);
  }
  
  // Update property status
  const property = await Property.findOneAndUpdate(
    { _id: propertyId, landlordId },
    { 
      status,
      statusNotes: notes,
      statusUpdatedAt: new Date()
    },
    { new: true }
  );
  
  if (!property) {
    throw new Error('Property not found or you do not have access');
  }
  
  // Clear cache
  await setCache(`property:${propertyId}`, null);
  await setCache(`properties:${landlordId}`, null);
  
  return property;
};

/**
 * Update the status of a room
 * @param {String} propertyId - The ID of the property
 * @param {String} roomId - The ID of the room
 * @param {String} landlordId - The ID of the landlord
 * @param {String} status - The new status
 * @param {String} notes - Optional notes about the status change
 */
const updateRoomStatus = async (propertyId, roomId, landlordId, status, notes = '') => {
  // Validate status
  if (!VALID_STATUSES.room.includes(status)) {
    throw new Error(`Invalid room status. Valid statuses are: ${VALID_STATUSES.room.join(', ')}`);
  }
  
  // Find property
  const property = await Property.findOne({ _id: propertyId, landlordId });
  if (!property) {
    throw new Error('Property not found or you do not have access');
  }
  
  // Find room in property
  const roomIndex = property.rooms.findIndex(r => r.roomId === roomId);
  if (roomIndex === -1) {
    throw new Error('Room not found in this property');
  }
  
  // Update room status
  property.rooms[roomIndex].status = status;
  property.rooms[roomIndex].statusNotes = notes;
  property.rooms[roomIndex].statusUpdatedAt = new Date();
  
  // Check if we need to update property status based on room statuses
  updatePropertyStatusBasedOnRooms(property);
  
  // Save property
  await property.save();
  
  // Clear cache
  await setCache(`property:${propertyId}`, null);
  await setCache(`properties:${landlordId}`, null);
  
  return property.rooms[roomIndex];
};

/**
 * Update the status of a bed
 * @param {String} propertyId - The ID of the property
 * @param {String} roomId - The ID of the room
 * @param {String} bedId - The ID of the bed
 * @param {String} landlordId - The ID of the landlord
 * @param {String} status - The new status
 * @param {String} notes - Optional notes about the status change
 */
const updateBedStatus = async (propertyId, roomId, bedId, landlordId, status, notes = '') => {
  // Validate status
  if (!VALID_STATUSES.bed.includes(status)) {
    throw new Error(`Invalid bed status. Valid statuses are: ${VALID_STATUSES.bed.join(', ')}`);
  }
  
  // Find property
  const property = await Property.findOne({ _id: propertyId, landlordId });
  if (!property) {
    throw new Error('Property not found or you do not have access');
  }
  
  // Find room in property
  const roomIndex = property.rooms.findIndex(r => r.roomId === roomId);
  if (roomIndex === -1) {
    throw new Error('Room not found in this property');
  }
  
  // Find bed in room
  const bedIndex = property.rooms[roomIndex].beds.findIndex(b => b.bedId === bedId);
  if (bedIndex === -1) {
    throw new Error('Bed not found in this room');
  }
  
  // Update bed status
  property.rooms[roomIndex].beds[bedIndex].status = status;
  property.rooms[roomIndex].beds[bedIndex].statusNotes = notes;
  property.rooms[roomIndex].beds[bedIndex].statusUpdatedAt = new Date();
  
  // Update room status based on bed statuses
  updateRoomStatusBasedOnBeds(property.rooms[roomIndex]);
  
  // Update property status based on room statuses
  updatePropertyStatusBasedOnRooms(property);
  
  // Save property
  await property.save();
  
  // Clear cache
  await setCache(`property:${propertyId}`, null);
  await setCache(`properties:${landlordId}`, null);
  
  return property.rooms[roomIndex].beds[bedIndex];
};

/**
 * Helper function to update room status based on its beds
 */
const updateRoomStatusBasedOnBeds = (room) => {
  if (!room.beds || room.beds.length === 0) {
    return; // No beds to check
  }
  
  const availableBeds = room.beds.filter(b => b.status === 'Available').length;
  const totalBeds = room.beds.length;
  
  if (availableBeds === 0) {
    room.status = 'Not Available';
  } else if (availableBeds < totalBeds) {
    room.status = 'Partially Available';
  } else {
    room.status = 'Available';
  }
  
  room.statusUpdatedAt = new Date();
};

/**
 * Helper function to update property status based on its rooms
 */
const updatePropertyStatusBasedOnRooms = (property) => {
  if (!property.rooms || property.rooms.length === 0) {
    return; // No rooms to check
  }
  
  const availableRooms = property.rooms.filter(r => r.status === 'Available').length;
  const partiallyAvailableRooms = property.rooms.filter(r => r.status === 'Partially Available').length;
  const totalRooms = property.rooms.length;
  
  if (availableRooms === 0 && partiallyAvailableRooms === 0) {
    property.status = 'Not Available';
  } else if (availableRooms === totalRooms) {
    property.status = 'Available';
  } else {
    property.status = 'Partially Available';
  }
  
  property.statusUpdatedAt = new Date();
};

/**
 * Get available properties for tenants
 */
const getAvailableProperties = async () => {
  const properties = await Property.find({
    $or: [
      { status: 'Available' },
      { status: 'Partially Available' }
    ]
  });
  
  return properties.map(property => ({
    _id: property._id,
    propertyId: property.propertyId,
    name: property.name,
    address: property.address,
    city: property.city,
    status: property.status,
    // Count available rooms and beds
    availableRooms: property.rooms.filter(r => 
      r.status === 'Available' || r.status === 'Partially Available'
    ).length,
    totalRooms: property.rooms.length,
    // Get pricing information
    startingPrice: Math.min(...property.rooms.map(r => r.price))
  }));
};

/**
 * Get available rooms in a property for tenants
 */
const getAvailableRoomsInProperty = async (propertyId) => {
  const property = await Property.findById(propertyId);
  
  if (!property) {
    throw new Error('Property not found');
  }
  
  return property.rooms
    .filter(room => room.status === 'Available' || room.status === 'Partially Available')
    .map(room => ({
      roomId: room.roomId,
      type: room.type,
      price: room.price,
      status: room.status,
      availableBeds: room.beds.filter(b => b.status === 'Available').length,
      totalBeds: room.beds.length,
      facilities: room.facilities
    }));
};

/**
 * Get available beds in a room for tenants
 */
const getAvailableBedsInRoom = async (propertyId, roomId) => {
  const property = await Property.findById(propertyId);
  
  if (!property) {
    throw new Error('Property not found');
  }
  
  const room = property.rooms.find(r => r.roomId === roomId);
  
  if (!room) {
    throw new Error('Room not found');
  }
  
  return room.beds
    .filter(bed => bed.status === 'Available')
    .map(bed => ({
      bedId: bed.bedId,
      price: bed.price,
      status: bed.status
    }));
};

module.exports = {
  updatePropertyStatus,
  updateRoomStatus,
  updateBedStatus,
  getAvailableProperties,
  getAvailableRoomsInProperty,
  getAvailableBedsInRoom,
  VALID_STATUSES
};
