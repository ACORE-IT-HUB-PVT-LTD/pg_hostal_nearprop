const mongoose = require('mongoose');

const accommodationSchema = new mongoose.Schema({
  landlordId: { type: mongoose.Schema.Types.ObjectId, ref: 'Landlord', required: true },
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
  propertyName: { type: String },
  roomId: { type: String, required: true },
  bedId: { type: String },
  localTenantId: { type: String, required: true }, // Landlord-specific tenant ID
  moveInDate: { type: Date, default: Date.now },
  moveOutDate: { type: Date },
  rentAmount: { type: Number, required: true, default: 0 },
  securityDeposit: { type: Number, default: 0 },
  pendingDues: { type: Number, default: 0 },
  monthlyCollection: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  notes: { type: String },
  specialRequests: { type: String },
  securityDepositStatus: { type: String, enum: ['Paid', 'Pending', 'Refunded', 'Partially Refunded', 'Deducted'], default: 'Pending' },
  securityDepositRefundAmount: { type: Number, default: 0 },
  securityDepositRefundDate: { type: Date },
  // New accommodation fields
  noticePeriod: { type: Number }, // Notice period in days (10, 15, 20, 30, 45, 60)
  agreementPeriod: { type: Number }, // Agreement period duration
  agreementPeriodType: { type: String, enum: ['months', 'years'], default: 'months' },
  rentOnDate: { type: Number, min: 1, max: 31 }, // Date of month when rent is due
  rentDateOption: { type: String, enum: ['fixed', 'joining', 'month_end'], default: 'fixed' },
  rentalFrequency: { type: String, enum: ['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'], default: 'Monthly' },
  referredBy: { type: String },
  remarks: { type: String },
  bookedBy: { type: String },
  // Electricity billing
  electricity: {
    perUnit: { type: Number },
    initialReading: { type: Number },
    finalReading: { type: Number },
    initialReadingDate: { type: Date },
    finalReadingDate: { type: Date },
    dueDescription: { type: String }
  },
  // Opening balance details
  openingBalance: {
    startDate: { type: Date },
    endDate: { type: Date },
    amount: { type: Number, default: 0 }
  }
}, { _id: false });

const billSchema = new mongoose.Schema({
  landlordId: { type: mongoose.Schema.Types.ObjectId, ref: 'Landlord', required: true },
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
  propertyName: { type: String },
  roomId: { type: String, required: true },
  bedId: { type: String },
  type: { type: String, enum: ['Electricity', 'Water', 'Maintenance', 'Rent', 'Security Deposit', 'Internet', 'Food', 'Cleaning', 'Gas', 'Other'], required: true },
  billNumber: { type: String, default: () => `BILL-${Math.random().toString(36).substr(2, 9)}` },
  month: { type: String },
  year: { type: String },
  amount: { type: Number, required: true },
  dueDate: { type: Date },
  paid: { type: Boolean, default: false },
  paidDate: { type: Date },
  paidAmount: { type: Number, default: 0 },
  paymentMethod: { type: String, enum: ['Cash', 'Bank Transfer', 'UPI', 'Cheque', 'Card', 'Other'] },
  transactionId: { type: String },
  invoiceUrl: { type: String },
  receiptUrl: { type: String },
  isRecurring: { type: Boolean, default: false },
  recurringFrequency: { type: String, enum: ['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'] },
  description: { type: String },
  billDetails: {
    previousReading: { type: Number },
    currentReading: { type: Number },
    units: { type: Number },
    ratePerUnit: { type: Number },
    fixedCharges: { type: Number },
    dueAmount: { type: Number, default: 0 },
    taxPercentage: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    discountReason: { type: String },
    lateFeesApplicable: { type: Boolean, default: false },
    lateFees: { type: Number, default: 0 }
  },
  reminders: [{
    sentDate: { type: Date },
    method: { type: String, enum: ['SMS', 'Email', 'Phone Call', 'In Person', 'WhatsApp'] },
    status: { type: String, enum: ['Sent', 'Delivered', 'Read', 'Responded'] }
  }]
}, { timestamps: true });

const complaintSchema = new mongoose.Schema({
  complaintId: { type: String, default: () => `COMP-${Math.random().toString(36).substr(2, 9)}` },
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
  landlordId: { type: mongoose.Schema.Types.ObjectId, ref: 'Landlord', required: true },
  roomId: { type: String },
  bedId: { type: String },
  subject: { type: String, required: true },
  description: { type: String, required: true },
  status: { type: String, enum: ['Pending', 'Accepted', 'In Progress', 'Resolved', 'Rejected'], default: 'Pending' },
  priority: { type: String, enum: ['Low', 'Medium', 'High', 'Critical'], default: 'Medium' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  landlordResponse: { type: String },
  resolvedAt: { type: Date }
}, { timestamps: true });

const tenantSchema = new mongoose.Schema({
  tenantId: { type: String, unique: true, default: () => `TENANT-${Math.random().toString(36).substr(2, 9)}` },
  name: { type: String, required: true },
  email: { type: String },
  aadhaar: { type: String, required: true },
  mobile: { type: String, required: true },
  permanentAddress: { type: String },
  work: { type: String },
  dob: { type: Date },
  gender: { type: String, enum: ['Male', 'Female', 'Other'] },
  maritalStatus: { type: String, enum: ['Married', 'Unmarried', 'Other'], default: 'Unmarried' },
  fatherName: { type: String },
  fatherMobile: { type: String },
  motherName: { type: String },
  motherMobile: { type: String },
  photo: { type: String }, // URL or base64 string
  emergencyContact: {
    name: { type: String },
    relation: { type: String },
    mobile: { type: String }
  },
  idProofs: [{
    type: { type: String, enum: ['Aadhaar', 'PAN', 'Driving License', 'Passport', 'Voter ID', 'Other'] },
    number: { type: String },
    documentUrl: { type: String }
  }],
  accommodations: [accommodationSchema],
  bookingRequests: [{
    requestId: { type: String, default: () => `REQ-${Math.random().toString(36).substr(2, 9)}` },
    propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
    propertyName: { type: String },
    roomId: { type: String },
    bedId: { type: String },
    landlordId: { type: mongoose.Schema.Types.ObjectId, ref: 'Landlord', required: true },
    status: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'], default: 'Pending' },
    moveInDate: { type: Date },
    duration: { type: Number }, // In months
    message: { type: String },
    requestDate: { type: Date, default: Date.now },
    responseDate: { type: Date },
    responseMessage: { type: String }
  }],
  bills: [billSchema],
  complaints: [complaintSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Create indexes for efficient queries
tenantSchema.index({ aadhaar: 1 });
tenantSchema.index({ mobile: 1 });
tenantSchema.index({ 'accommodations.landlordId': 1 });
tenantSchema.index({ 'accommodations.localTenantId': 1 });
tenantSchema.index({ 'accommodations.propertyId': 1 });
tenantSchema.index({ 'bookingRequests.landlordId': 1 });
tenantSchema.index({ 'bookingRequests.propertyId': 1 });
tenantSchema.index({ 'bookingRequests.status': 1 });
tenantSchema.index({ 'bills.landlordId': 1 });
tenantSchema.index({ 'complaints.landlordId': 1 });
tenantSchema.index({ 'complaints.propertyId': 1 });
tenantSchema.index({ 'complaints.status': 1 });

module.exports = mongoose.model('Tenant', tenantSchema);