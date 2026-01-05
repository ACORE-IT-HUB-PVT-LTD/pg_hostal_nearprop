const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const landlordController = require('../controllers/landlordController');
const bookingController = require('../controllers/bookingController');
const deletePropertyImagesHandler = require('../controllers/propertyImageController');
const roomImageController = require('../controllers/roomImageController');
const bedImageController = require('../controllers/bedImageController');
const { upload: fileUpload } = require('../utils/fileUpload');
const { upload: s3Upload } = require('../utils/s3Upload');
const authenticate = require("../middleware/authenticate");

// Field name mapping middleware
const mapFieldNames = (req, res, next) => {
  // Map aadhaar → aadhaarNumber and pan → panNumber if they exist
  if (req.body.aadhaar && !req.body.aadhaarNumber) {
    req.body.aadhaarNumber = req.body.aadhaar;
    delete req.body.aadhaar;
  }

  if (req.body.pan && !req.body.panNumber) {
    req.body.panNumber = req.body.pan;
    delete req.body.pan;
  }

  next();
};
//new
// Landlord account operations (without password)
router.post('/register', fileUpload.single('profilePhoto'), mapFieldNames, landlordController.registerLandlord);
router.post('/find', mapFieldNames, landlordController.findLandlord);
router.get('/profile', auth.required, landlordController.getLandlordProfile);
router.put('/profile', auth.required, fileUpload.single('profilePhoto'), mapFieldNames, landlordController.updateLandlordInfo);

// Debug route to see what's being received
router.post('/debug-register', (req, res) => {
  console.log('DEBUG REGISTER BODY:', JSON.stringify(req.body, null, 2));
  res.json({
    success: true,
    message: 'Debug info logged to console',
    receivedData: req.body
  });
});

// Financial analytics (placeholder endpoints)
router.get('/financials', auth.required, (req, res) => {
  res.status(200).json({ success: true, message: "Financial data will be available soon" });
});
router.get('/dues', auth.required, (req, res) => {
  res.status(200).json({ success: true, message: "Dues data will be available soon" });
});
router.get('/dues/electricity', auth.required, (req, res) => {
  res.status(200).json({ success: true, message: "Electricity dues data will be available soon" });
});
router.get('/dues/rent', auth.required, (req, res) => {
  res.status(200).json({ success: true, message: "Rent dues data will be available soon" });
});
router.get('/collection', auth.required, (req, res) => {
  res.status(200).json({ success: true, message: "Collection data will be available soon" });
});

// Complaint Management
router.get('/complaints', auth.required, (req, res) => {
  res.status(200).json({ success: true, message: "Complaint data will be available soon" });
});

// Tenant management
router.get('/tenants', auth.required, (req, res) => {
  res.status(200).json({ success: true, message: "Tenant data will be available soon" });
});

// Property management
router.get('/properties', auth.required, landlordController.getProperties);
router.get('/properties/pending-properties', auth.required, landlordController.getPendingProperties);
router.get('/properties/pending-properties/admin', authenticate, landlordController.getPendingProperties);
router.patch(
  '/properties/:propertyId/status/admin',
  authenticate,
  landlordController.updatePropertyStatus
);

router.get('/properties/available', auth.required, (req, res) => {
  res.status(200).json({ success: true, message: "Available properties data will be available soon" });
});
router.post('/properties', auth.required, s3Upload.array('images', 10), landlordController.addProperty);
router.post("/property/view/:id", landlordController.increaseViewCount);


// // Property update and delete routes
// router.patch("/property/:id/approve",approveProperty);
// router.patch("/property/:id/reject",rejectProperty);
router.put('/properties/:id', auth.required, landlordController.updateProperty);
router.put('/properties', auth.required, landlordController.updateProperty); // Alternative route allowing propertyId in body

// Property image upload routes - separate from property update
router.post('/properties/:id/images', auth.required, s3Upload.array('images', 10), landlordController.uploadPropertyImages);
router.post('/properties/images', auth.required, s3Upload.array('images', 10), landlordController.uploadPropertyImages); // Alternative route allowing propertyId in body

// Property image deletion routes
router.delete('/properties/:id/images', auth.required, deletePropertyImagesHandler);
router.delete('/properties/images', auth.required, deletePropertyImagesHandler); // Alternative route allowing propertyId in body

router.delete('/properties/:id', auth.required, landlordController.deleteProperty);
router.get('/properties/:id', auth.required, landlordController.getPropertyById);

// Booking and pending tenant routes
router.get('/tenants/pending', auth.required, bookingController.getPendingTenants);
router.get('/booking-requests', auth.required, bookingController.getBookingRequests);
router.put('/booking-requests', auth.required, bookingController.updateBookingRequest);

module.exports = router;
