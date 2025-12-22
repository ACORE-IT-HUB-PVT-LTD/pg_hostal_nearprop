/**
 * ID Generator Service
 * Handles generating sequential IDs for properties, rooms, and beds
 * Format:
 * - Properties: PROP1001, PROP1002, etc.
 * - Rooms: PROP1001-R1, PROP1001-R2, etc.
 * - Beds: PROP1001-R1-B1, PROP1001-R1-B2, etc.
 */

const mongoose = require('mongoose');
const Property = require('../models/Property');

// Define a counter schema to track the next ID to use
const counterSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  value: { type: Number, default: 1000 }
});

// Create Counter model if it doesn't exist
let Counter;
try {
  Counter = mongoose.model('Counter');
} catch (error) {
  Counter = mongoose.model('Counter', counterSchema);
}

/**
 * Get the next sequence value for a given counter
 * @param {String} counterName - The name of the counter
 * @returns {Number} - The next sequence value
 */
const getNextSequence = async (counterName) => {
  const counter = await Counter.findOneAndUpdate(
    { name: counterName },
    { $inc: { value: 1 } },
    { new: true, upsert: true }
  );
  return counter.value;
};

/**
 * Generate a new property ID
 * @returns {String} - The new property ID (e.g., PROP1001)
 */
const generatePropertyId = async () => {
  const nextSequence = await getNextSequence('propertyId');
  return `PROP${nextSequence}`;
};

/**
 * Generate a room ID for a property
 * @param {String} propertyId - The property ID
 * @param {Number} roomCounter - The room counter
 * @returns {String} - The new room ID (e.g., PROP1001-R1)
 */
const generateRoomId = (propertyId, roomCounter) => {
  return `${propertyId}-R${roomCounter}`;
};

/**
 * Generate a bed ID for a room
 * @param {String} roomId - The room ID
 * @param {Number} bedCounter - The bed counter
 * @returns {String} - The new bed ID (e.g., PROP1001-R1-B1)
 */
const generateBedId = (roomId, bedCounter) => {
  return `${roomId}-B${bedCounter}`;
};

/**
 * Update all IDs in a property to follow the standardized format
 * @param {String} propertyId - The MongoDB ID of the property to update
 */
const standardizePropertyIds = async (propertyId) => {
  const property = await Property.findById(propertyId);
  if (!property) {
    throw new Error('Property not found');
  }
  
  // Generate a new property ID if it doesn't follow our format
  if (!property.propertyId || !property.propertyId.startsWith('PROP')) {
    property.propertyId = await generatePropertyId();
  }
  
  // Standardize room IDs
  if (property.rooms && property.rooms.length > 0) {
    property.rooms.forEach((room, roomIndex) => {
      const roomNumber = roomIndex + 1;
      room.roomId = generateRoomId(property.propertyId, roomNumber);
      
      // Standardize bed IDs
      if (room.beds && room.beds.length > 0) {
        room.beds.forEach((bed, bedIndex) => {
          const bedNumber = bedIndex + 1;
          bed.bedId = generateBedId(room.roomId, bedNumber);
        });
      }
    });
  }
  
  // Save the updated property
  await property.save();
  return property;
};

/**
 * Update all properties in the system to follow standardized ID format
 */
const standardizeAllPropertyIds = async () => {
  const properties = await Property.find();
  const results = {
    total: properties.length,
    updated: 0,
    errors: []
  };
  
  for (const property of properties) {
    try {
      // Generate a new property ID if needed
      if (!property.propertyId || !property.propertyId.startsWith('PROP')) {
        property.propertyId = await generatePropertyId();
      }
      
      // Standardize room IDs
      if (property.rooms && property.rooms.length > 0) {
        property.rooms.forEach((room, roomIndex) => {
          const roomNumber = roomIndex + 1;
          room.roomId = generateRoomId(property.propertyId, roomNumber);
          
          // Standardize bed IDs
          if (room.beds && room.beds.length > 0) {
            room.beds.forEach((bed, bedIndex) => {
              const bedNumber = bedIndex + 1;
              bed.bedId = generateBedId(room.roomId, bedNumber);
            });
          }
        });
      }
      
      // Save the updated property
      await property.save();
      results.updated++;
    } catch (error) {
      results.errors.push({
        propertyId: property._id,
        error: error.message
      });
    }
  }
  
  return results;
};

module.exports = {
  generatePropertyId,
  generateRoomId,
  generateBedId,
  standardizePropertyIds,
  standardizeAllPropertyIds
};
