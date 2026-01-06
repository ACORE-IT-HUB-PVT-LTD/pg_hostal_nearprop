const mongoose = require('mongoose');

const tenantSchema = new mongoose.Schema({
  tenantId: { type: String, default: () => `TENANT-${Math.random().toString(36).substr(2, 9)}` },
  name: { type: String, required: true },
  email: { type: String },
  aadhaar: { type: String, required: true },
  mobile: { type: String, required: true },
  permanentAddress: { type: String },
  work: { type: String },
  dob: { type: Date },
  maritalStatus: { type: String, enum: ['Married', 'Unmarried', 'Other'], default: 'Unmarried' },
  fatherName: { type: String },
  fatherMobile: { type: String },
  motherName: { type: String },
  motherMobile: { type: String },
  photo: { type: String }, // URL or base64 string
  roomId: { type: String, ref: 'roomId' },
  bedId: { type: String, ref: 'bedId' },
  landlordId: { type: mongoose.Schema.Types.ObjectId, ref: 'Landlord' }, // Track which landlord added this tenant
  joinDate: { type: Date, default: Date.now },
  moveInDate: { type: Date }, // When tenant moved in
  moveOutDate: { type: Date }, // When tenant moved out or expected to move out
  rentAmount: { type: Number, default: 0 },
  securityDeposit: { type: Number, default: 0 },
  pendingDues: { type: Number, default: 0 },
  // Enhanced fields matching the accommodation schema
  noticePeriod: { type: Number }, // Notice period in days
  agreementPeriod: { type: Number }, // Duration of agreement
  agreementPeriodType: { type: String, enum: ['months', 'years'], default: 'months' },
  rentOnDate: { type: Number }, // Day of month when rent is due
  rentDateOption: { type: String, enum: ['fixed', 'joining', 'month_end'], default: 'fixed' },
  rentalFrequency: { type: String, enum: ['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'], default: 'Monthly' },
  referredBy: { type: String },
  remarks: { type: String },
  bookedBy: { type: String },
  // Electricity billing details
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

const bedSchema = new mongoose.Schema({
  bedId: { type: String, default: () => `BED-${Math.random().toString(36).substr(2, 9)}` },
  status: { type: String, enum: ['Available', 'Not Available', 'Unavailable', 'Maintenance', 'Reserved'], default: 'Available' },
  price: { type: Number, required: true },
  name: { type: String, required: false }, // Modified to be optional
  monthlyCollection: { type: Number, default: 0 },
  pendingDues: { type: Number, default: 0 },
  images: [{ type: String }], // Array of image URLs stored in S3
  tenants: [tenantSchema],
  electricityBill: {
    lastReading: { type: Number, default: 0 },
    currentReading: { type: Number, default: 0 },
    unitsConsumed: { type: Number, default: 0 },
    ratePerUnit: { type: Number, default: 0 },
    billAmount: { type: Number, default: 0 },
    billDate: { type: Date },
    dueDate: { type: Date },
    isPaid: { type: Boolean, default: false }
  }
}, { _id: false });

const roomSchema = new mongoose.Schema({
  name: { type: String, required: false }, // Modified to be optional and non-unique
  roomId: { type: String, default: () => `ROOM-${Math.random().toString(36).substr(2, 9)}` },
  type: {
    type: String, enum: [
      'PG', 'AC', // Added these new room types
      'Single Sharing', 'Double Sharing', 'Triple Sharing', 'Four Sharing', 'Five Sharing',
      'Six Sharing', 'More Than 6 Sharing', 'Private Room', 'Shared Room', 'Couple',
      'Family', 'Male Only', 'Female Only', 'Unisex', 'Student Only', 'Working Professionals Only'
    ], required: true
  },
  status: { type: String, enum: ['Available', 'Not Available', 'Partially Available', 'Under Maintenance', 'Reserved'], default: 'Available' },
  price: { type: Number, required: true },
  capacity: { type: Number, default: 1 },
  monthlyCollection: { type: Number, default: 0 },
  pendingDues: { type: Number, default: 0 },
  images: [{ type: String }], // Array of image URLs stored in S3
  beds: [bedSchema],
  tenants: [tenantSchema],
  lastMaintenanceDate: { type: Date },
  nextMaintenanceDate: { type: Date },
  floorNumber: { type: Number },
  roomSize: { type: String }, // in sq.ft
  securityDeposit: { type: Number, default: 0 },
  noticePeriod: { type: Number, default: 30 }, // in days
  facilities: {
    roomEssentials: {
      bed: { type: Boolean, default: false },
      mattress: { type: Boolean, default: false },
      pillow: { type: Boolean, default: false },
      blanket: { type: Boolean, default: false },
      fan: { type: Boolean, default: false },
      light: { type: Boolean, default: false },
      chargingPoint: { type: Boolean, default: false },
      cupboardWardrobe: { type: Boolean, default: false },
      tableStudyDesk: { type: Boolean, default: false },
      chair: { type: Boolean, default: false },
      roomLock: { type: Boolean, default: false }
    },
    comfortFeatures: {
      ac: { type: Boolean, default: false },
      cooler: { type: Boolean, default: false },
      heater: { type: Boolean, default: false },
      ceilingFan: { type: Boolean, default: false },
      window: { type: Boolean, default: false },
      balcony: { type: Boolean, default: false },
      ventilation: { type: Boolean, default: false },
      curtains: { type: Boolean, default: false }
    },
    washroomHygiene: {
      attachedBathroom: { type: Boolean, default: false },
      commonBathroom: { type: Boolean, default: false },
      westernToilet: { type: Boolean, default: false },
      indianToilet: { type: Boolean, default: false },
      geyser: { type: Boolean, default: false },
      water24x7: { type: Boolean, default: false },
      washBasins: { type: Boolean, default: false },
      mirror: { type: Boolean, default: false },
      bucketMug: { type: Boolean, default: false },
      cleaningService: { type: Boolean, default: false }
    },
    utilitiesConnectivity: {
      wifi: { type: Boolean, default: false },
      powerBackup: { type: Boolean, default: false },
      electricityIncluded: { type: Boolean, default: false },
      waterIncluded: { type: Boolean, default: false },
      gasIncluded: { type: Boolean, default: false },
      maintenanceIncluded: { type: Boolean, default: false },
      tv: { type: Boolean, default: false },
      dthCable: { type: Boolean, default: false }
    },
    laundryHousekeeping: {
      washingMachine: { type: Boolean, default: false },
      laundryArea: { type: Boolean, default: false },
      dryingSpace: { type: Boolean, default: false },
      ironTable: { type: Boolean, default: false }
    },
    securitySafety: {
      cctv: { type: Boolean, default: false },
      biometricEntry: { type: Boolean, default: false },
      securityGuard: { type: Boolean, default: false },
      visitorRestricted: { type: Boolean, default: false },
      fireSafety: { type: Boolean, default: false }
    },
    parkingTransport: {
      bikeParking: { type: Boolean, default: false },
      carParking: { type: Boolean, default: false },
      coveredParking: { type: Boolean, default: false },
      nearBus: { type: Boolean, default: false },
      nearMetro: { type: Boolean, default: false }
    },
    propertySpecific: {
      sharingType: { type: String, enum: ['1', '2', '3', '4'], default: null },
      genderSpecific: { type: String, enum: ['Boys', 'Girls', 'Unisex'], default: null },
      curfewTiming: { type: String, default: null },
      guestAllowed: { type: Boolean, default: false },
      bedrooms: { type: Number, default: null },
      bathrooms: { type: Number, default: null },
      hall: { type: Boolean, default: false },
      modularKitchen: { type: Boolean, default: false },
      furnishingType: { type: String, enum: ['Fully', 'Semi', 'Unfurnished'], default: null },
      propertyFloor: { type: String, default: null },
      liftAvailable: { type: Boolean, default: false },
      separateEntry: { type: Boolean, default: false }
    },
    nearbyFacilities: {
      grocery: { type: Boolean, default: false },
      hospital: { type: Boolean, default: false },
      gym: { type: Boolean, default: false },
      park: { type: Boolean, default: false },
      schoolCollege: { type: Boolean, default: false },
      marketMall: { type: Boolean, default: false }
    }
  }
}, { _id: false });

const propertySchema = new mongoose.Schema({
  propertyId: { type: String, unique: true, default: () => `PROP-${Math.random().toString(36).substr(2, 9)}` },
  id: {
    type: Number,
    unique: true
  },
  landlordId: { type: mongoose.Schema.Types.ObjectId, ref: 'Landlord', required: true },
  name: { type: String, required: true },
  type: { type: String, enum: ['PG', 'Hostel', 'Rental', '1 BHK', '2 BHK', '3 BHK', '4 BHK', '1 RK', 'Studio Apartment', 'Luxury Bungalows', 'Villas', 'Builder Floor', 'Flat', 'Room'], required: true },
  address: { type: String, required: true },
  pinCode: { type: String },
  city: { type: String },
  state: { type: String },
  landmark: { type: String },
  contactNumber: { type: String },
  ownerName: { type: String },
  description: { type: String },
  images: [{ type: String }], // URLs or base64 strings
  latitude: { type: Number },
  longitude: { type: Number },
  // GeoJSON location field for geospatial queries
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] } // [longitude, latitude]
  },
  rooms: [roomSchema],
  totalRooms: { type: Number, default: 0 },
  totalBeds: { type: Number, default: 0 },
  monthlyCollection: { type: Number, default: 0 },
  pendingDues: { type: Number, default: 0 },
  totalCapacity: { type: Number, default: 0 },
  occupiedSpace: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true }, // Added for admin toggle functionality
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  status: {
    type: String,
    enum: ["PENDING", "APPROVED", "REJECTED"],
    default: "PENDING",
  },

  statusReason: {
    type: String,
    trim: true,
    default: null
  },

  approvedAt: {
    type: Date,
    default: null
  },

  rejectedAt: {
    type: Date,
    default: null
  },
  viewsCount: {
    type: Number,
    default: 0
  },
});

// Add geospatial index for location-based queries
propertySchema.index({ location: '2dsphere' });

propertySchema.pre('save', function (next) {
  if (this.isModified('status')) {

    if (this.status === 'APPROVED') {
      this.approvedAt = new Date();
      this.rejectedAt = null;
      this.statusReason = null;
    }

    if (this.status === 'REJECTED') {
      if (!this.statusReason) {
        return next(new Error('Rejection reason is required'));
      }
      this.rejectedAt = new Date();
      this.approvedAt = null;
    }
  }
  next();
});

propertySchema.path('status').set(function(value) {
  if (typeof value === 'string') {
    return value.toUpperCase();
  }
  return value;
});



// Middleware to update location field from latitude and longitude before saving
propertySchema.pre('save', function (next) {
  if (this.latitude && this.longitude) {
    this.location = {
      type: 'Point',
      coordinates: [this.longitude, this.latitude] // GeoJSON uses [longitude, latitude] order
    };
  }

  // Update timestamps
  this.updatedAt = new Date();

  next();
});

module.exports = mongoose.model('Property', propertySchema);