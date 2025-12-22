/**
 * ID Management Controllers
 * Handles standardizing and updating IDs for properties, rooms, and beds
 */
const Property = require('../models/Property');
const idGenerator = require('../services/idGenerator');

/**
 * Standardize the IDs of a specific property
 */
const standardizePropertyIds = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const landlordId = req.user.id;
    
    // Check property ownership
    const propertyExists = await Property.findOne({
      _id: propertyId,
      landlordId
    });
    
    if (!propertyExists) {
      return res.status(404).json({
        success: false,
        message: 'Property not found or you do not have access'
      });
    }
    
    // Standardize IDs
    const property = await idGenerator.standardizePropertyIds(propertyId);
    
    res.json({
      success: true,
      message: 'Property IDs standardized successfully',
      property: {
        _id: property._id,
        propertyId: property.propertyId,
        name: property.name,
        rooms: property.rooms.map(room => ({
          roomId: room.roomId,
          beds: room.beds?.map(bed => ({ bedId: bed.bedId }))
        }))
      }
    });
  } catch (error) {
    console.error('Error in standardizePropertyIds:', error);
    res.status(500).json({
      success: false,
      message: 'Error standardizing property IDs',
      error: error.message
    });
  }
};

/**
 * Standardize all property IDs for a landlord
 */
const standardizeAllLandlordPropertyIds = async (req, res) => {
  try {
    const landlordId = req.user.id;
    
    // Get all properties for this landlord
    const properties = await Property.find({ landlordId });
    
    const results = {
      total: properties.length,
      updated: 0,
      errors: []
    };
    
    // Standardize each property
    for (const property of properties) {
      try {
        await idGenerator.standardizePropertyIds(property._id);
        results.updated++;
      } catch (error) {
        results.errors.push({
          propertyId: property._id,
          error: error.message
        });
      }
    }
    
    res.json({
      success: true,
      message: 'Property IDs standardized',
      results
    });
  } catch (error) {
    console.error('Error in standardizeAllLandlordPropertyIds:', error);
    res.status(500).json({
      success: false,
      message: 'Error standardizing property IDs',
      error: error.message
    });
  }
};

/**
 * For admin use - standardize ALL properties in the system
 */
const standardizeAllSystemPropertyIds = async (req, res) => {
  try {
    // Verify this is an admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    
    // Standardize all properties
    const results = await idGenerator.standardizeAllPropertyIds();
    
    res.json({
      success: true,
      message: 'System-wide property IDs standardized',
      results
    });
  } catch (error) {
    console.error('Error in standardizeAllSystemPropertyIds:', error);
    res.status(500).json({
      success: false,
      message: 'Error standardizing system-wide property IDs',
      error: error.message
    });
  }
};

module.exports = {
  standardizePropertyIds,
  standardizeAllLandlordPropertyIds,
  standardizeAllSystemPropertyIds
};
