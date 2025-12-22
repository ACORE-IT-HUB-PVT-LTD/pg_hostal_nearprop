const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const landlordAuth = require('../middleware/landlordAuth');
const { 
  addTenant, 
  getTenants, 
  getTenantById, 
  updateTenant, 
  getTenantsByProperty,
  assignTenantToProperty,
  removeTenantFromProperty
} = require('../controllers/tenantController');
const {
  addElectricityBill,
  addTenantBill,
  getTenantBills,
  getTenantDues,
  recordBillPayment
} = require('../controllers/billingController');
const { 
  getAllTenantDues 
} = require('../controllers/analyticsController');
const {
  addComplaint,
  getTenantComplaints,
  updateComplaintStatus
} = require('../controllers/complaintController');

// Tenant Management Routes
router.post('/', auth.required, addTenant);
router.get('/', auth.required, getTenants);
router.get('/property/:propertyId', auth.required, getTenantsByProperty);
router.get('/:tenantId', auth.required, getTenantById);
router.put('/:tenantId', auth.required, updateTenant);

// Tenant Assignment Routes
router.post('/assign', auth.required, assignTenantToProperty);
router.post('/remove', auth.required, removeTenantFromProperty);

// Billing Routes
router.post('/bill', auth.required, addElectricityBill); // For electricity bills
router.post('/general-bill', auth.required, addTenantBill); // For any type of bill
router.post('/bill/:tenantId', auth.required, addTenantBill);
router.get('/bills/:tenantId', auth.required, getTenantBills);
router.get('/dues/:tenantId', auth.required, getTenantDues);
router.post('/payment', auth.required, recordBillPayment);

// Landlord Analytics Routes
router.get('/dues/all', auth.required, landlordAuth, getAllTenantDues);

// Complaint Routes
router.post('/complaint', auth.required, addComplaint);
router.get('/:tenantId/complaints', auth.required, getTenantComplaints);
router.patch('/:tenantId/complaint/:complaintId', auth.required, landlordAuth, updateComplaintStatus);

// Import booking controller
const { submitBookingRequest } = require('../controllers/bookingController');

// Booking Request Routes
router.post('/booking-request', auth.required, submitBookingRequest);

module.exports = router;