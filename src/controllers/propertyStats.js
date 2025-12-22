const Property = require('../models/Property');
const mongoose = require('mongoose');
const { setCache, getCache } = require('../utils/redis');

/**
 * Get property occupancy statistics
 */
const getPropertyOccupancy = async (req, res) => {
  try {
    const { propertyId } = req.params;
    
    // Find property
    const property = await Property.findOne({
      _id: propertyId,
      landlordId: req.user.id
    });
    
    if (!property) {
      return res.status(404).json({ message: 'Property not found or you do not have access' });
    }
    
    // Calculate room occupancy
    const totalRooms = property.rooms.length;
    const occupiedRooms = property.rooms.filter(room => room.status === 'Not Available').length;
    const roomOccupancyRate = totalRooms > 0 ? (occupiedRooms / totalRooms) * 100 : 0;
    
    // Calculate bed occupancy
    let totalBeds = 0;
    let occupiedBeds = 0;
    property.rooms.forEach(room => {
      if (room.beds && room.beds.length > 0) {
        totalBeds += room.beds.length;
        occupiedBeds += room.beds.filter(bed => bed.status === 'Not Available').length;
      }
    });
    const bedOccupancyRate = totalBeds > 0 ? (occupiedBeds / totalBeds) * 100 : 0;
    
    // Calculate occupancy by room type
    const roomTypeOccupancy = {};
    property.rooms.forEach(room => {
      if (!roomTypeOccupancy[room.type]) {
        roomTypeOccupancy[room.type] = {
          total: 0,
          occupied: 0,
          rate: 0
        };
      }
      
      roomTypeOccupancy[room.type].total++;
      if (room.status === 'Not Available') {
        roomTypeOccupancy[room.type].occupied++;
      }
    });
    
    // Calculate occupancy rates by room type
    Object.keys(roomTypeOccupancy).forEach(type => {
      const data = roomTypeOccupancy[type];
      data.rate = data.total > 0 ? (data.occupied / data.total) * 100 : 0;
    });
    
    res.status(200).json({
      propertyId: property._id,
      propertyName: property.name,
      totalRooms,
      occupiedRooms,
      availableRooms: totalRooms - occupiedRooms,
      roomOccupancyRate: Math.round(roomOccupancyRate),
      totalBeds,
      occupiedBeds,
      availableBeds: totalBeds - occupiedBeds,
      bedOccupancyRate: Math.round(bedOccupancyRate),
      roomTypeOccupancy
    });
  } catch (error) {
    console.error('Error in getPropertyOccupancy:', error);
    res.status(500).json({ message: 'Error fetching property occupancy', error: error.message });
  }
};

/**
 * Get property rent collection statistics
 */
const getPropertyRentCollection = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const { month, year } = req.query;
    
    // Find property
    const property = await Property.findOne({
      _id: propertyId,
      landlordId: req.user.id
    });
    
    if (!property) {
      return res.status(404).json({ message: 'Property not found or you do not have access' });
    }
    
    // Calculate total monthly collection
    let totalMonthlyCollection = property.monthlyCollection || 0;
    
    // Calculate collection by room type
    const roomTypeCollection = {};
    property.rooms.forEach(room => {
      if (!roomTypeCollection[room.type]) {
        roomTypeCollection[room.type] = 0;
      }
      
      roomTypeCollection[room.type] += room.monthlyCollection || 0;
      
      // Add bed collections for this room
      if (room.beds && room.beds.length > 0) {
        room.beds.forEach(bed => {
          roomTypeCollection[room.type] += bed.monthlyCollection || 0;
        });
      }
    });
    
    res.status(200).json({
      propertyId: property._id,
      propertyName: property.name,
      totalMonthlyCollection,
      roomTypeCollection,
      month: month || new Date().toLocaleString('default', { month: 'long' }),
      year: year || new Date().getFullYear().toString()
    });
  } catch (error) {
    console.error('Error in getPropertyRentCollection:', error);
    res.status(500).json({ message: 'Error fetching property rent collection', error: error.message });
  }
};

/**
 * Get property dues statistics
 */
const getPropertyDues = async (req, res) => {
  try {
    const { propertyId } = req.params;
    
    // Find property
    const property = await Property.findOne({
      _id: propertyId,
      landlordId: req.user.id
    });
    
    if (!property) {
      return res.status(404).json({ message: 'Property not found or you do not have access' });
    }
    
    // Calculate total pending dues
    let totalPendingDues = property.pendingDues || 0;
    
    // Calculate dues by room
    const roomDues = [];
    property.rooms.forEach(room => {
      const roomData = {
        roomId: room.roomId,
        type: room.type,
        pendingDues: room.pendingDues || 0,
        bedDues: []
      };
      
      // Add bed dues for this room
      if (room.beds && room.beds.length > 0) {
        room.beds.forEach(bed => {
          roomData.bedDues.push({
            bedId: bed.bedId,
            pendingDues: bed.pendingDues || 0
          });
        });
      }
      
      roomDues.push(roomData);
    });
    
    res.status(200).json({
      propertyId: property._id,
      propertyName: property.name,
      totalPendingDues,
      roomDues
    });
  } catch (error) {
    console.error('Error in getPropertyDues:', error);
    res.status(500).json({ message: 'Error fetching property dues', error: error.message });
  }
};

/**
 * Search properties by name, address, or other criteria
 */
const searchProperties = async (req, res) => {
  try {
    const { query, type, city, minPrice, maxPrice } = req.query;
    
    // Build the search query
    const searchQuery = { landlordId: req.user.id };
    
    if (query) {
      searchQuery.$or = [
        { name: new RegExp(query, 'i') },
        { address: new RegExp(query, 'i') },
        { description: new RegExp(query, 'i') }
      ];
    }
    
    if (type) {
      searchQuery.type = type;
    }
    
    if (city) {
      searchQuery.city = new RegExp(city, 'i');
    }
    
    // Find properties matching the search criteria
    let properties = await Property.find(searchQuery);
    
    // Apply price filters if needed
    if (minPrice || maxPrice) {
      properties = properties.filter(property => {
        // Get the minimum price of any room in the property
        const prices = property.rooms.map(room => room.price);
        const minPropertyPrice = Math.min(...prices);
        
        if (minPrice && minPropertyPrice < minPrice) {
          return false;
        }
        
        if (maxPrice && minPropertyPrice > maxPrice) {
          return false;
        }
        
        return true;
      });
    }
    
    // Format response
    const formattedProperties = properties.map(property => ({
      id: property._id,
      propertyId: property.propertyId,
      name: property.name,
      type: property.type,
      address: property.address,
      city: property.city,
      roomCount: property.rooms.length,
      minPrice: Math.min(...property.rooms.map(room => room.price))
    }));
    
    res.status(200).json(formattedProperties);
  } catch (error) {
    console.error('Error in searchProperties:', error);
    res.status(500).json({ message: 'Error searching properties', error: error.message });
  }
};

/**
 * Get properties by type
 */
const getPropertiesByType = async (req, res) => {
  try {
    const { propertyType } = req.params;
    
    // Find properties of the specified type
    const properties = await Property.find({
      landlordId: req.user.id,
      type: propertyType
    });
    
    // Format response
    const formattedProperties = properties.map(property => ({
      id: property._id,
      propertyId: property.propertyId,
      name: property.name,
      address: property.address,
      city: property.city,
      roomCount: property.rooms.length,
      minPrice: property.rooms.length > 0 ? 
        Math.min(...property.rooms.map(room => room.price)) : 0
    }));
    
    res.status(200).json(formattedProperties);
  } catch (error) {
    console.error('Error in getPropertiesByType:', error);
    res.status(500).json({ message: 'Error fetching properties by type', error: error.message });
  }
};

/**
 * Get available rooms in a property
 */
const getAvailableRooms = async (req, res) => {
  try {
    const { propertyId } = req.params;
    
    // Find property
    const property = await Property.findOne({
      _id: propertyId,
      landlordId: req.user.id
    });
    
    if (!property) {
      return res.status(404).json({ message: 'Property not found or you do not have access' });
    }
    
    // Get available rooms
    const availableRooms = property.rooms
      .filter(room => room.status === 'Available')
      .map(room => ({
        roomId: room.roomId,
        type: room.type,
        price: room.price,
        capacity: room.capacity,
        facilities: room.facilities
      }));
    
    res.status(200).json({
      propertyId: property._id,
      propertyName: property.name,
      availableRooms
    });
  } catch (error) {
    console.error('Error in getAvailableRooms:', error);
    res.status(500).json({ message: 'Error fetching available rooms', error: error.message });
  }
};

/**
 * Get available beds in a property
 */
const getAvailableBeds = async (req, res) => {
  try {
    const { propertyId } = req.params;
    
    // Find property
    const property = await Property.findOne({
      _id: propertyId,
      landlordId: req.user.id
    });
    
    if (!property) {
      return res.status(404).json({ message: 'Property not found or you do not have access' });
    }
    
    // Get available beds grouped by room
    const availableBeds = [];
    
    property.rooms.forEach(room => {
      if (room.beds && room.beds.length > 0) {
        const roomBeds = room.beds
          .filter(bed => bed.status === 'Available')
          .map(bed => ({
            bedId: bed.bedId,
            price: bed.price
          }));
        
        if (roomBeds.length > 0) {
          availableBeds.push({
            roomId: room.roomId,
            roomType: room.type,
            beds: roomBeds
          });
        }
      }
    });
    
    res.status(200).json({
      propertyId: property._id,
      propertyName: property.name,
      availableBeds
    });
  } catch (error) {
    console.error('Error in getAvailableBeds:', error);
    res.status(500).json({ message: 'Error fetching available beds', error: error.message });
  }
};

module.exports = {
  getPropertyOccupancy,
  getPropertyRentCollection,
  getPropertyDues,
  searchProperties,
  getPropertiesByType,
  getAvailableRooms,
  getAvailableBeds
};
