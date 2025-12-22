const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const tenantAuth = require('../middleware/tenantAuth');

// Import tenant controllers
const {
  getAvailableRooms,
  getPropertiesByType,
  getPropertyDetails,
  getTenantAccommodations,
  getTenantBookingRequests,
  cancelBookingRequest,
  getTenantBillsSummary,
  getTenantProfile,
  getTenantRooms,
  getTenantLandlords
} = require('../controllers/tenantViewController');

// Import related controllers
const { submitBookingRequest } = require('../controllers/bookingController');
const {
  addComplaint,
  getTenantComplaints
} = require('../controllers/complaintController');
const {
  getTenantBills,
  getTenantDues,
  recordBillPayment
} = require('../controllers/billingController');

// Tenant profile
router.get('/profile', auth.required, tenantAuth, getTenantProfile);

// Room/Property viewing
router.get('/rooms/available', auth.required, getAvailableRooms);
router.get('/properties/:type', auth.required, getPropertiesByType); // New endpoint for property type browsing
router.get('/property/:propertyId', auth.required, getPropertyDetails); // New endpoint for detailed property view
router.get('/my-rooms', auth.required, tenantAuth, getTenantRooms);
router.get('/landlords', auth.required, tenantAuth, getTenantLandlords);

// Accommodation routes
router.get('/accommodations', auth.required, tenantAuth, getTenantAccommodations);

// Booking requests
router.post('/booking-request', auth.required, tenantAuth, submitBookingRequest);
router.get('/booking-requests', auth.required, tenantAuth, getTenantBookingRequests);
router.patch('/booking-request/:requestId/cancel', auth.required, tenantAuth, cancelBookingRequest);

// Bills and payments
router.get('/bills', auth.required, tenantAuth, getTenantBills);
router.get('/bills/summary', auth.required, tenantAuth, getTenantBillsSummary);
router.get('/dues', auth.required, tenantAuth, getTenantDues);
router.post('/payment', auth.required, tenantAuth, recordBillPayment);

// Complaint management
router.post('/complaint', auth.required, tenantAuth, addComplaint);
router.get('/complaints', auth.required, tenantAuth, getTenantComplaints);

module.exports = router;

// Complaint routes
router.post('/complaint', auth.required, tenantAuth, addComplaint);
router.get('/complaints', auth.required, tenantAuth, getTenantComplaints);

module.exports = router;
