/**
 * Status Management Controllers
 * Handles updating the availability status of properties, rooms, and beds
 */
const statusManagement = require('../services/statusManagement');

/**
 * Update property status
 */
const updatePropertyStatus = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const { status, notes } = req.body;
    const landlordId = req.user.id;
    
    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }
    
    // Update property status
    const property = await statusManagement.updatePropertyStatus(propertyId, landlordId, status, notes);
    
    res.json({
      success: true,
      message: 'Property status updated successfully',
      property: {
        _id: property._id,
        propertyId: property.propertyId,
        name: property.name,
        status: property.status
      }
    });
  } catch (error) {
    console.error('Error in updatePropertyStatus:', error);
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      message: error.message || 'Error updating property status'
    });
  }
};

/**
 * Update room status
 */
const updateRoomStatus = async (req, res) => {
  try {
    const { propertyId, roomId } = req.params;
    const { status, notes } = req.body;
    const landlordId = req.user.id;
    
    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }
    
    // Update room status
    const room = await statusManagement.updateRoomStatus(propertyId, roomId, landlordId, status, notes);
    
    res.json({
      success: true,
      message: 'Room status updated successfully',
      room: {
        roomId: room.roomId,
        status: room.status
      }
    });
  } catch (error) {
    console.error('Error in updateRoomStatus:', error);
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      message: error.message || 'Error updating room status'
    });
  }
};

/**
 * Update bed status
 */
const updateBedStatus = async (req, res) => {
  try {
    const { propertyId, roomId, bedId } = req.params;
    const { status, notes } = req.body;
    const landlordId = req.user.id;
    
    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }
    
    // Update bed status
    const bed = await statusManagement.updateBedStatus(propertyId, roomId, bedId, landlordId, status, notes);
    
    res.json({
      success: true,
      message: 'Bed status updated successfully',
      bed: {
        bedId: bed.bedId,
        status: bed.status
      }
    });
  } catch (error) {
    console.error('Error in updateBedStatus:', error);
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      message: error.message || 'Error updating bed status'
    });
  }
};

/**
 * Get available rooms for tenants
 */
const getAvailableRooms = async (req, res) => {
  try {
    const { propertyId } = req.params;
    
    // Get available rooms
    const rooms = await statusManagement.getAvailableRoomsInProperty(propertyId);
    
    res.json({
      success: true,
      rooms
    });
  } catch (error) {
    console.error('Error in getAvailableRooms:', error);
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      message: error.message || 'Error fetching available rooms'
    });
  }
};

/**
 * Get available beds for tenants
 */
const getAvailableBeds = async (req, res) => {
  try {
    const { propertyId, roomId } = req.params;
    
    // Get available beds
    const beds = await statusManagement.getAvailableBedsInRoom(propertyId, roomId);
    
    res.json({
      success: true,
      beds
    });
  } catch (error) {
    console.error('Error in getAvailableBeds:', error);
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      message: error.message || 'Error fetching available beds'
    });
  }
};

/**
 * Get valid statuses for entities
 */
const getValidStatuses = (req, res) => {
  try {
    res.json({
      success: true,
      validStatuses: statusManagement.VALID_STATUSES
    });
  } catch (error) {
    console.error('Error in getValidStatuses:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching valid statuses'
    });
  }
};

module.exports = {
  updatePropertyStatus,
  updateRoomStatus,
  updateBedStatus,
  getAvailableRooms,
  getAvailableBeds,
  getValidStatuses
};
