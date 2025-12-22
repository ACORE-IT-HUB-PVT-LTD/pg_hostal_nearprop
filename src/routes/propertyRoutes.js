// Property-related API endpoints
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { attachRatingSummary } = require('../middleware/ratingEnhancement');
const {
  addProperty,
  getProperties,
  getPropertyById,
  updateProperty,
  deleteProperty,
  addRoomToProperty,
  updateRoom,
  deleteRoom
} = require('../controllers/propertyController');

// Import geocoding middleware for automatic coordinate generation
const { geocodePropertyAddress } = require('../middleware/propertyGeocodingMiddleware');

// Import status management controllers
const {
  updatePropertyStatus,
  updateRoomStatus,
  updateBedStatus,
  getAvailableRooms,
  getAvailableBeds,
  getValidStatuses
} = require('../controllers/statusController');

// Import ID management controllers
const {
  standardizePropertyIds,
  standardizeAllLandlordPropertyIds
} = require('../controllers/idController');

// Import facility management controllers
const { 
  updatePropertyFacilities
} = require('../controllers/propertyFacilities');

// Import comprehensive update controller
const {
  updatePropertyComprehensive
} = require('../controllers/propertyComprehensiveUpdate');

// Import unified room controller
const {
  updateRoomUnified
} = require('../controllers/unifiedRoomController');

// Import enhanced bed management controllers
const {
  addBedToRoom,
  updateBed,
  deleteBed
} = require('../controllers/bedController');

// Import image controllers
const roomImageController = require('../controllers/roomImageController');
const bedImageController = require('../controllers/bedImageController');
const { upload: s3Upload } = require('../utils/s3Upload');

// Apply rating summary middleware to all property responses
router.use(attachRatingSummary);

// Property Management Routes
router.post('/', auth.required, geocodePropertyAddress, addProperty);
router.get('/', auth.required, getProperties);
router.get('/:propertyId', auth.required, getPropertyById);
router.put('/:propertyId', auth.required, geocodePropertyAddress, updateProperty);
router.put('/:propertyId/comprehensive', auth.required, geocodePropertyAddress, updatePropertyComprehensive);  // New comprehensive update endpoint
router.delete('/:propertyId', auth.required, deleteProperty);

// Room Management Routes
router.post('/:propertyId/rooms', auth.required, addRoomToProperty);
router.get('/:propertyId/rooms/available', auth.required, getAvailableRooms);
router.put('/:propertyId/rooms/:roomId', auth.required, updateRoomUnified);  // Unified endpoint for room updates (includes facilities)
router.put('/:propertyId/facilities', auth.required, updatePropertyFacilities);  // Property-wide facilities update
router.delete('/:propertyId/rooms/:roomId', auth.required, deleteRoom);

// Room Image Routes
router.post('/:propertyId/rooms/:roomId/images', auth.required, s3Upload.array('images', 10), roomImageController.uploadRoomImages);
router.delete('/:propertyId/rooms/:roomId/images', auth.required, roomImageController.deleteRoomImages);

// Bed Management Routes
router.post('/:propertyId/rooms/:roomId/beds', auth.required, addBedToRoom);
router.put('/:propertyId/rooms/:roomId/beds/:bedId', auth.required, updateBed);
router.delete('/:propertyId/rooms/:roomId/beds/:bedId', auth.required, deleteBed);

// Bed Image Routes
router.post('/:propertyId/rooms/:roomId/beds/:bedId/images', auth.required, s3Upload.array('images', 5), bedImageController.uploadBedImages);
router.delete('/:propertyId/rooms/:roomId/beds/:bedId/images', auth.required, bedImageController.deleteBedImages);

// Status Management Routes
router.get('/statuses', getValidStatuses);
router.put('/:propertyId/status', auth.required, updatePropertyStatus);
router.put('/:propertyId/rooms/:roomId/status', auth.required, updateRoomStatus);
router.put('/:propertyId/rooms/:roomId/beds/:bedId/status', auth.required, updateBedStatus);

// ID Management Routes
router.put('/:propertyId/standardize-ids', auth.required, standardizePropertyIds);
router.put('/standardize-all-ids', auth.required, standardizeAllLandlordPropertyIds);

// Available Units for Tenants
router.get('/available', getAvailableRooms);
router.get('/:propertyId/rooms/:roomId/available-beds', getAvailableBeds);

// Note: Nearby Property routes have been moved to nearbyPublicRoutes.js
// These routes are now handled via the dedicated path '/api/properties/nearby'
// and should not be accessed through the standard property routes

module.exports = router;