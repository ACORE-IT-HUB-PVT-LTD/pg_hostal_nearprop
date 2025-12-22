const Property = require('../models/Property');

/**
 * Helper function to format property location data consistently
 */
const formatPropertyLocation = (property) => {
  return {
    address: property.address || "",
    city: property.city || "",
    state: property.state || "",
    pinCode: property.pinCode || "",
    landmark: property.landmark || "",
    latitude: property.latitude || null,
    longitude: property.longitude || null
  };
};

/**
 * Get all properties with filtering options - PUBLIC API
 * @route GET /api/public/properties
 */
exports.getAllPublicProperties = async (req, res) => {
  try {
    const {
      city,
      state,
      type,
      minPrice,
      maxPrice,
      facility,
      availabilityStatus,
      gender,
      sharingType,
      sortBy,
      roomType,
      propertyAge,
      rating,
      amenities,
      foodIncluded,
      nearbyFacilities,
      hasParking
    } = req.query;

    console.log('Public properties search with filters:', req.query);

    // Base query to find properties
    const query = {};

    // Apply filters if provided
    if (city) {
      query.city = { $regex: new RegExp(city, 'i') }; // Case-insensitive search
    }

    if (state) {
      query.state = { $regex: new RegExp(state, 'i') };
    }

    if (type) {
      query.type = type;
    }
    
    // Additional filter for property age
    if (propertyAge) {
      const ageInYears = parseInt(propertyAge);
      if (!isNaN(ageInYears)) {
        const cutoffDate = new Date();
        cutoffDate.setFullYear(cutoffDate.getFullYear() - ageInYears);
        query.createdAt = { $gte: cutoffDate };
      }
    }
    
    // Filter by rating if provided
    if (rating) {
      const minRating = parseFloat(rating);
      if (!isNaN(minRating)) {
        query.rating = { $gte: minRating };
      }
    }
    
    // Filter for food included
    if (foodIncluded === 'true') {
      query['rooms.facilities.propertySpecific.food'] = true;
    }
    
    // Filter for parking availability
    if (hasParking === 'true') {
      query.$or = [
        { 'rooms.facilities.parkingTransport.bikeParking': true },
        { 'rooms.facilities.parkingTransport.carParking': true }
      ];
    }

    // Price filter for rooms - using $or to check either room price or bed price
    if (minPrice || maxPrice) {
      const priceQuery = {};
      if (minPrice) priceQuery.$gte = Number(minPrice);
      if (maxPrice) priceQuery.$lte = Number(maxPrice);

      query.$or = [
        { 'rooms.price': priceQuery },
        { 'rooms.beds.price': priceQuery }
      ];
    }

    // Gender-specific filter
    if (gender) {
      query.$or = [
        { 'rooms.type': { $regex: new RegExp(gender, 'i') } },
        { 'rooms.facilities.propertySpecific.genderSpecific': gender }
      ];
    }

    // Sharing type filter
    if (sharingType) {
      if (sharingType === 'Single') {
        query['rooms.type'] = 'Single Sharing';
      } else if (sharingType === 'Double') {
        query['rooms.type'] = 'Double Sharing';
      } else if (sharingType === 'Triple') {
        query['rooms.type'] = 'Triple Sharing';
      } else if (sharingType === 'Multiple') {
        query['rooms.type'] = { $in: ['Four Sharing', 'Five Sharing', 'Six Sharing', 'More Than 6 Sharing'] };
      }
    }

    // Availability filter
    if (availabilityStatus) {
      if (availabilityStatus.toLowerCase() === 'available') {
        query.$or = [
          { 'rooms.status': 'Available' },
          { 'rooms.status': 'Partially Available' },
          { 'rooms.beds.status': 'Available' }
        ];
      }
    }

    // Facility filter
    if (facility) {
      const facilities = facility.split(',');
      const facilityQueries = [];
      
      facilities.forEach(f => {
        // Common facilities mapping
        switch(f.toLowerCase()) {
          case 'wifi':
            facilityQueries.push({ 'rooms.facilities.utilitiesConnectivity.wifi': true });
            break;
          case 'ac':
            facilityQueries.push({ 'rooms.facilities.comfortFeatures.ac': true });
            break;
          case 'attachedBathroom':
            facilityQueries.push({ 'rooms.facilities.washroomHygiene.attachedBathroom': true });
            break;
          case 'food':
            facilityQueries.push({ 'rooms.facilities.propertySpecific.food': true });
            break;
          case 'parking':
            facilityQueries.push({ 
              $or: [
                { 'rooms.facilities.parkingTransport.bikeParking': true },
                { 'rooms.facilities.parkingTransport.carParking': true }
              ]
            });
            break;
          case 'security':
            facilityQueries.push({ 'rooms.facilities.securitySafety.securityGuard': true });
            break;
          case 'powerBackup':
            facilityQueries.push({ 'rooms.facilities.utilitiesConnectivity.powerBackup': true });
            break;
          case 'tv':
            facilityQueries.push({ 'rooms.facilities.utilitiesConnectivity.tv': true });
            break;
          case 'geyser':
            facilityQueries.push({ 'rooms.facilities.washroomHygiene.geyser': true });
            break;
          case 'westernToilet':
            facilityQueries.push({ 'rooms.facilities.washroomHygiene.westernToilet': true });
            break;
          case 'balcony':
            facilityQueries.push({ 'rooms.facilities.comfortFeatures.balcony': true });
            break;
          case 'cooler':
            facilityQueries.push({ 'rooms.facilities.comfortFeatures.cooler': true });
            break;
          case 'cupboard':
            facilityQueries.push({ 'rooms.facilities.roomEssentials.cupboardWardrobe': true });
            break;
          case 'studyTable':
            facilityQueries.push({ 'rooms.facilities.roomEssentials.tableStudyDesk': true });
            break;
          case 'laundry':
            facilityQueries.push({ 'rooms.facilities.propertySpecific.laundry': true });
            break;
          case 'gym':
            facilityQueries.push({ 'rooms.facilities.recreationFitness.gym': true });
            break;
          case 'cctv':
            facilityQueries.push({ 'rooms.facilities.securitySafety.cctv': true });
            break;
        }
      });
      
      if (facilityQueries.length > 0) {
        query.$and = facilityQueries;
      }
    }

    console.log('Final query:', JSON.stringify(query));

    // Find properties with the constructed query
    let propertiesQuery = Property.find(query)
      .select('propertyId name type address pinCode city state landmark images totalRooms totalBeds rooms.price rooms.status rooms.type rooms.capacity');

    // Apply sorting
    if (sortBy) {
      switch(sortBy) {
        case 'priceAsc':
          propertiesQuery = propertiesQuery.sort({ 'rooms.price': 1 });
          break;
        case 'priceDesc':
          propertiesQuery = propertiesQuery.sort({ 'rooms.price': -1 });
          break;
        case 'newest':
          propertiesQuery = propertiesQuery.sort({ 'createdAt': -1 });
          break;
        case 'oldest':
          propertiesQuery = propertiesQuery.sort({ 'createdAt': 1 });
          break;
        default:
          propertiesQuery = propertiesQuery.sort({ 'createdAt': -1 }); // Default to newest
      }
    } else {
      propertiesQuery = propertiesQuery.sort({ 'createdAt': -1 }); // Default to newest
    }

    // Execute query
    const properties = await propertiesQuery.exec();

    // Calculate min and max prices for response
    let minPriceFound = Infinity;
    let maxPriceFound = 0;

    properties.forEach(property => {
      property.rooms.forEach(room => {
        if (room.price < minPriceFound) minPriceFound = room.price;
        if (room.price > maxPriceFound) maxPriceFound = room.price;
        
        if (room.beds && room.beds.length > 0) {
          room.beds.forEach(bed => {
            if (bed.price < minPriceFound) minPriceFound = bed.price;
            if (bed.price > maxPriceFound) maxPriceFound = bed.price;
          });
        }
      });
    });

    // If no properties found, set default min/max
    if (minPriceFound === Infinity) minPriceFound = 0;

    // Format response
    const formattedProperties = properties.map(property => {
      // Calculate available rooms and beds
      const availableRooms = property.rooms.filter(room => 
        room.status === 'Available' || room.status === 'Partially Available'
      ).length;
      
      let availableBeds = 0;
      property.rooms.forEach(room => {
        if (room.beds && room.beds.length > 0) {
          availableBeds += room.beds.filter(bed => bed.status === 'Available').length;
        }
      });

      // Get lowest price
      let lowestPrice = Infinity;
      property.rooms.forEach(room => {
        if (room.price < lowestPrice) lowestPrice = room.price;
        
        if (room.beds && room.beds.length > 0) {
          room.beds.forEach(bed => {
            if (bed.price < lowestPrice) lowestPrice = bed.price;
          });
        }
      });
      if (lowestPrice === Infinity) lowestPrice = 0;

      // Return formatted property
      return {
        id: property._id,
        propertyId: property.propertyId,
        name: property.name,
        type: property.type,
        location: {
          address: property.address,
          city: property.city,
          state: property.state,
          pinCode: property.pinCode,
          landmark: property.landmark
        },
        totalRooms: property.totalRooms,
        totalBeds: property.totalBeds,
        availableRooms: availableRooms,
        availableBeds: availableBeds,
        lowestPrice: lowestPrice,
        images: property.images && property.images.length > 0 ? 
          property.images.slice(0, 3) : [], // Return up to 3 images
        hasAvailability: availableRooms > 0 || availableBeds > 0,
        landlordInfo: property.landlordId ? {
          name: property.landlordId.name,
          mobile: property.landlordId.mobile,
          email: property.landlordId.email
        } : null
      };
    });

    // Filter out properties with no availability if requested
    const finalProperties = availabilityStatus === 'available' ? 
      formattedProperties.filter(p => p.hasAvailability) : 
      formattedProperties;

    res.json({
      success: true,
      count: finalProperties.length,
      priceRange: {
        min: minPriceFound,
        max: maxPriceFound
      },
      properties: finalProperties
    });
  } catch (err) {
    console.error('Error fetching public properties:', err.message);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message
    });
  }
};

/**
 * Get property details by ID - PUBLIC API
 * @route GET /api/public/property/:propertyId
 */
exports.getPublicPropertyById = async (req, res) => {
  try {
    // Expanded property selection to include all fields
    const property = await Property.findOne({
      $or: [
        { _id: req.params.propertyId },
        { propertyId: req.params.propertyId }
      ]
    }).populate({
      path: 'landlordId',
      select: 'name email mobile profilePhoto -_id',
      options: { lean: true }
    });

    if (!property) {
      return res.status(404).json({
        success: false,
        message: "Property not found"
      });
    }

    // Format rooms with availability information
    const formattedRooms = property.rooms.map(room => {
      // Count available beds
      const availableBeds = room.beds ? 
        room.beds.filter(bed => bed.status === 'Available').length : 0;
      
      // Determine room availability status
      let availabilityStatus;
      if (room.status === 'Available') {
        availabilityStatus = 'Available';
      } else if (room.status === 'Partially Available' || availableBeds > 0) {
        availabilityStatus = 'Partially Available';
      } else {
        availabilityStatus = 'Not Available';
      }
      
      // Map all facilities to a simplified format
      const facilities = [];
      
      if (room.facilities) {
        const f = room.facilities;
        
        // Room essentials
        if (f.roomEssentials) {
          if (f.roomEssentials.bed) facilities.push('Bed');
          if (f.roomEssentials.cupboardWardrobe) facilities.push('Cupboard/Wardrobe');
          if (f.roomEssentials.tableStudyDesk) facilities.push('Table/Study Desk');
        }
        
        // Comfort features
        if (f.comfortFeatures) {
          if (f.comfortFeatures.ac) facilities.push('AC');
          if (f.comfortFeatures.cooler) facilities.push('Cooler');
          if (f.comfortFeatures.window) facilities.push('Window');
          if (f.comfortFeatures.balcony) facilities.push('Balcony');
        }
        
        // Washroom
        if (f.washroomHygiene) {
          if (f.washroomHygiene.attachedBathroom) facilities.push('Attached Bathroom');
          if (f.washroomHygiene.geyser) facilities.push('Geyser/Hot Water');
          if (f.washroomHygiene.westernToilet) facilities.push('Western Toilet');
        }
        
        // Utilities
        if (f.utilitiesConnectivity) {
          if (f.utilitiesConnectivity.wifi) facilities.push('WiFi');
          if (f.utilitiesConnectivity.powerBackup) facilities.push('Power Backup');
          if (f.utilitiesConnectivity.tv) facilities.push('TV');
        }
        
        // Security
        if (f.securitySafety) {
          if (f.securitySafety.cctv) facilities.push('CCTV');
          if (f.securitySafety.securityGuard) facilities.push('Security Guard');
        }
        
        // Parking
        if (f.parkingTransport) {
          if (f.parkingTransport.bikeParking) facilities.push('Bike Parking');
          if (f.parkingTransport.carParking) facilities.push('Car Parking');
        }

        // Laundry and housekeeping
        if (f.laundryHousekeeping) {
          if (f.laundryHousekeeping.washingMachine) facilities.push('Washing Machine');
          if (f.laundryHousekeeping.laundryArea) facilities.push('Laundry Area');
          if (f.laundryHousekeeping.dryingSpace) facilities.push('Drying Space');
          if (f.laundryHousekeeping.ironTable) facilities.push('Iron Table');
        }
      }
      
      // Format beds with detailed information
      const formattedBeds = room.beds ? room.beds.map(bed => {
        return {
          bedId: bed.bedId,
          name: bed.name || `Bed ${bed.bedId}`,
          status: bed.status,
          price: bed.price,
          monthlyCollection: bed.monthlyCollection || 0,
          pendingDues: bed.pendingDues || 0,
          tenantInfo: bed.tenants && bed.tenants.length > 0 ? {
            count: bed.tenants.length,
            names: bed.tenants.map(tenant => tenant.name)
          } : null
        };
      }) : [];

      // Return formatted room data with detailed beds
      return {
        roomId: room.roomId,
        name: room.name || `Room ${room.roomId}`,
        type: room.type,
        price: room.price,
        capacity: room.capacity,
        status: availabilityStatus,
        totalBeds: room.beds ? room.beds.length : 0,
        availableBeds: availableBeds,
        facilities: facilities,
        hasAttachedBathroom: room.facilities?.washroomHygiene?.attachedBathroom || false,
        hasAC: room.facilities?.comfortFeatures?.ac || false,
        beds: formattedBeds,
        allFacilities: room.facilities || {}
      };
    });
    
    // Extract facility details from all rooms to create property-wide facility data
    const propertyFacilities = {
      roomEssentials: {},
      comfortFeatures: {},
      washroomHygiene: {},
      utilitiesConnectivity: {},
      laundryHousekeeping: {},
      securitySafety: {},
      parkingTransport: {},
      propertySpecific: {},
      nearbyFacilities: {}
    };
    
    // Calculate minimum and maximum room/bed prices
    let minRoomPrice = Infinity;
    let maxRoomPrice = 0;
    let minBedPrice = Infinity;
    let maxBedPrice = 0;
    
    // Process all rooms to extract aggregate data
    property.rooms.forEach(room => {
      // Track price ranges
      if (room.price < minRoomPrice) minRoomPrice = room.price;
      if (room.price > maxRoomPrice) maxRoomPrice = room.price;
      
      // Process beds for price data
      if (room.beds && room.beds.length > 0) {
        room.beds.forEach(bed => {
          if (bed.price < minBedPrice) minBedPrice = bed.price;
          if (bed.price > maxBedPrice) maxBedPrice = bed.price;
        });
      }
      
      // Aggregate facilities across rooms
      if (room.facilities) {
        Object.keys(room.facilities).forEach(categoryKey => {
          const category = room.facilities[categoryKey];
          if (category && typeof category === 'object') {
            // Create the category in propertyFacilities if it doesn't exist
            if (!propertyFacilities[categoryKey]) {
              propertyFacilities[categoryKey] = {};
            }
            
            Object.keys(category).forEach(facilityKey => {
              // Initialize if not exists
              if (!propertyFacilities[categoryKey][facilityKey]) {
                propertyFacilities[categoryKey][facilityKey] = {
                  available: false,
                  count: 0,
                  percentage: 0
                };
              }
              
              // Update counts if facility is true
              if (category[facilityKey] === true) {
                propertyFacilities[categoryKey][facilityKey].count++;
                propertyFacilities[categoryKey][facilityKey].available = true;
              }
            });
          }
        });
      }
    });
    
    // Calculate percentages for each facility
    const totalRooms = property.rooms.length;
    Object.keys(propertyFacilities).forEach(categoryKey => {
      // Skip if category object is undefined
      if (!propertyFacilities[categoryKey]) return;
      
      Object.keys(propertyFacilities[categoryKey]).forEach(facilityKey => {
        // Skip if facility object is undefined
        if (!propertyFacilities[categoryKey][facilityKey]) return;
        
        if (propertyFacilities[categoryKey][facilityKey].available) {
          propertyFacilities[categoryKey][facilityKey].percentage = 
            Math.round((propertyFacilities[categoryKey][facilityKey].count / totalRooms) * 100);
        }
      });
    });
    
    // Format property response with enhanced details
    const formattedProperty = {
      id: property._id,
      propertyId: property.propertyId,
      name: property.name,
      type: property.type,
      location: formatPropertyLocation(property),
      contactNumber: property.contactNumber,
      description: property.description,
      images: property.images || [],
      totalRooms: property.totalRooms,
      totalBeds: property.totalBeds,
      rooms: formattedRooms,
      commonFacilities: extractCommonFacilities(property),
      facilitiesDetail: propertyFacilities,
      pricing: {
        rooms: {
          min: minRoomPrice !== Infinity ? minRoomPrice : 0,
          max: maxRoomPrice
        },
        beds: {
          min: minBedPrice !== Infinity ? minBedPrice : 0,
          max: maxBedPrice
        }
      },
      createdAt: property.createdAt,
      landlord: property.landlordId ? {
        name: property.landlordId.name,
        contactNumber: property.landlordId.mobile,
        email: property.landlordId.email,
        profilePhoto: property.landlordId.profilePhoto
      } : null,
      availability: {
        hasAvailableRooms: formattedRooms.some(room => room.status === 'Available' || room.status === 'Partially Available'),
        availableRoomCount: formattedRooms.filter(room => room.status === 'Available').length,
        availableBedCount: formattedRooms.reduce((total, room) => total + room.availableBeds, 0)
      },
      rating: property.rating || 0,
      reviews: property.reviews || []
    };

    res.json({
      success: true,
      property: formattedProperty
    });
  } catch (err) {
    console.error('Error fetching public property by ID:', err.message);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message
    });
  }
};

/**
 * Get properties by type (PG, Hostel, Rental, etc.) - PUBLIC API
 * @route GET /api/public/properties/:type
 */
exports.getPublicPropertiesByType = async (req, res) => {
  try {
    const { type } = req.params;
    const { city, minPrice, maxPrice, sortBy } = req.query;
    
    // Build the query
    const query = { type };
    
    if (city) {
      query.city = { $regex: new RegExp(city, 'i') };
    }
    
    // Add price filters if provided
    if (minPrice || maxPrice) {
      const priceQuery = {};
      if (minPrice) priceQuery.$gte = Number(minPrice);
      if (maxPrice) priceQuery.$lte = Number(maxPrice);

      query.$or = [
        { 'rooms.price': priceQuery },
        { 'rooms.beds.price': priceQuery }
      ];
    }
    
    // Find properties matching the query
    let propertiesQuery = Property.find(query)
      .select('propertyId name type address city state pinCode images rooms totalRooms totalBeds createdAt landlordId')
      .populate({ 
        path: 'landlordId', 
        select: 'name email mobile profilePhoto -_id',
        options: { lean: true }
      });
      
    // Apply sorting
    if (sortBy) {
      switch(sortBy) {
        case 'priceAsc':
          propertiesQuery = propertiesQuery.sort({ 'rooms.price': 1 });
          break;
        case 'priceDesc':
          propertiesQuery = propertiesQuery.sort({ 'rooms.price': -1 });
          break;
        case 'newest':
          propertiesQuery = propertiesQuery.sort({ 'createdAt': -1 });
          break;
        case 'oldest':
          propertiesQuery = propertiesQuery.sort({ 'createdAt': 1 });
          break;
        default:
          propertiesQuery = propertiesQuery.sort({ 'createdAt': -1 });
      }
    } else {
      propertiesQuery = propertiesQuery.sort({ 'createdAt': -1 });
    }
      
    const properties = await propertiesQuery.exec();
    
    // Format properties for response
    const formattedProperties = properties.map(property => {
      // Calculate available rooms and beds
      const availableRooms = property.rooms.filter(room => 
        room.status === 'Available' || room.status === 'Partially Available'
      ).length;
      
      let availableBeds = 0;
      let lowestPrice = Infinity;
      
      property.rooms.forEach(room => {
        if (room.price < lowestPrice) lowestPrice = room.price;
        
        if (room.beds && room.beds.length > 0) {
          availableBeds += room.beds.filter(bed => bed.status === 'Available').length;
          
          room.beds.forEach(bed => {
            if (bed.price < lowestPrice) lowestPrice = bed.price;
          });
        }
      });
      
      if (lowestPrice === Infinity) lowestPrice = 0;
      
      return {
        id: property._id,
        propertyId: property.propertyId,
        name: property.name,
        type: property.type,
        location: {
          city: property.city,
          state: property.state
        },
        availableRooms,
        availableBeds,
        totalRooms: property.totalRooms,
        totalBeds: property.totalBeds,
        lowestPrice,
        images: property.images && property.images.length > 0 ? 
          property.images.slice(0, 1) : [], // Just return first image
        hasAvailability: availableRooms > 0 || availableBeds > 0,
        landlordInfo: property.landlordId ? {
          name: property.landlordId.name,
          mobile: property.landlordId.mobile,
          email: property.landlordId.email
        } : null
      };
    });
    
    res.json({
      success: true,
      type,
      count: formattedProperties.length,
      properties: formattedProperties
    });
  } catch (err) {
    console.error('Error fetching properties by type:', err.message);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message
    });
  }
};

/**
 * Helper function to extract common facilities from a property
 */
function extractCommonFacilities(property) {
  // This will aggregate facilities across all rooms
  const facilityCounts = {
    wifi: 0,
    ac: 0,
    attachedBathroom: 0,
    powerBackup: 0,
    tv: 0,
    parking: 0,
    securityGuard: 0,
    cctv: 0,
    geyser: 0,
  };
  
  let totalRooms = 0;
  
  // Count facilities across all rooms
  if (property.rooms && property.rooms.length > 0) {
    totalRooms = property.rooms.length;
    
    property.rooms.forEach(room => {
      const f = room.facilities;
      if (!f) return;
      
      // Check all facility types with optional chaining to handle undefined facilities safely
      if (f.utilitiesConnectivity?.wifi) facilityCounts.wifi++;
      if (f.comfortFeatures?.ac) facilityCounts.ac++;
      if (f.washroomHygiene?.attachedBathroom) facilityCounts.attachedBathroom++;
      if (f.utilitiesConnectivity?.powerBackup) facilityCounts.powerBackup++;
      if (f.utilitiesConnectivity?.tv) facilityCounts.tv++;
      if (f.parkingTransport?.bikeParking || f.parkingTransport?.carParking) 
        facilityCounts.parking++;
      if (f.securitySafety?.securityGuard) facilityCounts.securityGuard++;
      if (f.securitySafety?.cctv) facilityCounts.cctv++;
      if (f.washroomHygiene?.geyser) facilityCounts.geyser++;
    });
  }
  
  // A facility is common if it's in more than 50% of rooms
  const commonFacilities = [];
  const threshold = totalRooms * 0.5;
  
  if (facilityCounts.wifi > threshold) commonFacilities.push('WiFi');
  if (facilityCounts.ac > threshold) commonFacilities.push('AC');
  if (facilityCounts.attachedBathroom > threshold) commonFacilities.push('Attached Bathroom');
  if (facilityCounts.powerBackup > threshold) commonFacilities.push('Power Backup');
  if (facilityCounts.tv > threshold) commonFacilities.push('TV');
  if (facilityCounts.parking > threshold) commonFacilities.push('Parking');
  if (facilityCounts.securityGuard > threshold) commonFacilities.push('Security Guard');
  if (facilityCounts.cctv > threshold) commonFacilities.push('CCTV');
  if (facilityCounts.geyser > threshold) commonFacilities.push('Geyser/Hot Water');
  
  return commonFacilities;
}

/**
 * Get property filters and statistics - PUBLIC API
 * @route GET /api/public/property-stats
 */
exports.getPublicPropertyStats = async (req, res) => {
  try {
    // Get counts by property type
    const typeCounts = await Property.aggregate([
      { $group: { _id: "$type", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    // Get counts by city
    const cityCounts = await Property.aggregate([
      { $match: { city: { $exists: true, $ne: null } } },
      { $group: { _id: "$city", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    // Get price range
    const priceRange = await Property.aggregate([
      { $unwind: "$rooms" },
      { $group: { 
        _id: null, 
        minPrice: { $min: "$rooms.price" }, 
        maxPrice: { $max: "$rooms.price" } 
      }}
    ]);
    
    // Format response
    const typeStats = typeCounts.map(item => ({
      type: item._id,
      count: item.count
    }));
    
    const cityStats = cityCounts.map(item => ({
      city: item._id,
      count: item.count
    }));
    
    const price = priceRange.length > 0 ? {
      min: priceRange[0].minPrice,
      max: priceRange[0].maxPrice
    } : { min: 0, max: 0 };
    
    res.json({
      success: true,
      stats: {
        propertyTypes: typeStats,
        topCities: cityStats,
        priceRange: price
      }
    });
  } catch (err) {
    console.error('Error fetching property stats:', err.message);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message
    });
  }
};

/**
 * Get recommended properties based on location or user preferences - PUBLIC API
 * @route GET /api/public/properties/recommended
 */
exports.getRecommendedProperties = async (req, res) => {
  try {
    const { city, type, priceRange } = req.query;
    
    // Base query
    const query = {};
    
    // Add filters if provided
    if (city) {
      query.city = { $regex: new RegExp(city, 'i') };
    }
    
    if (type) {
      query.type = type;
    }
    
    if (priceRange) {
      const [min, max] = priceRange.split('-').map(Number);
      query.$or = [
        { 'rooms.price': { $gte: min, $lte: max } },
        { 'rooms.beds.price': { $gte: min, $lte: max } }
      ];
    }
    
    // Get only properties with available rooms or beds
    query.$or = [
      { 'rooms.status': 'Available' },
      { 'rooms.status': 'Partially Available' },
      { 'rooms.beds.status': 'Available' }
    ];
    
    // Find recommended properties
    const properties = await Property.find(query)
      .select('propertyId name type address city state images rooms.price')
      .sort({ createdAt: -1 })
      .limit(10);
    
    // Format properties for response
    const formattedProperties = properties.map(property => {
      // Get lowest price
      let lowestPrice = Infinity;
      property.rooms.forEach(room => {
        if (room.price < lowestPrice) lowestPrice = room.price;
        
        if (room.beds && room.beds.length > 0) {
          room.beds.forEach(bed => {
            if (bed.price < lowestPrice) lowestPrice = bed.price;
          });
        }
      });
      if (lowestPrice === Infinity) lowestPrice = 0;
      
      return {
        id: property._id,
        propertyId: property.propertyId,
        name: property.name,
        type: property.type,
        location: {
          city: property.city,
          state: property.state
        },
        lowestPrice,
        images: property.images && property.images.length > 0 ? 
          [property.images[0]] : [] // Just return first image
      };
    });
    
    res.json({
      success: true,
      recommended: formattedProperties
    });
  } catch (err) {
    console.error('Error fetching recommended properties:', err.message);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message
    });
  }
};

/**
 * Search properties by location radius - PUBLIC API
 * @route GET /api/public/properties/nearby
 */
exports.searchPropertiesByRadius = async (req, res) => {
  try {
    const { lat, lng, radius = 5, type, minPrice, maxPrice } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: "Latitude and longitude are required for location-based search"
      });
    }
    
    // Convert to numbers
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const radiusInKm = parseFloat(radius);
    
    // Validate inputs
    if (isNaN(latitude) || isNaN(longitude) || isNaN(radiusInKm)) {
      return res.status(400).json({
        success: false,
        message: "Invalid coordinates or radius provided"
      });
    }
    
    // Build the query with geospatial search
    // Using the Haversine formula directly in MongoDB query
    // 6371 is Earth's radius in kilometers
    const query = {
      $and: [
        {
          $expr: {
            $lte: [
              {
                $multiply: [
                  6371,
                  {
                    $acos: {
                      $min: [
                        1,
                        {
                          $add: [
                            {
                              $multiply: [
                                { $cos: { $degreesToRadians: latitude } },
                                { $cos: { $degreesToRadians: "$latitude" } },
                                { $cos: { 
                                  $subtract: [
                                    { $degreesToRadians: "$longitude" },
                                    { $degreesToRadians: longitude }
                                  ] 
                                } }
                              ]
                            },
                            {
                              $multiply: [
                                { $sin: { $degreesToRadians: latitude } },
                                { $sin: { $degreesToRadians: "$latitude" } }
                              ]
                            }
                          ]
                        }
                      ]
                    }
                  }
                ]
              },
              radiusInKm
            ]
          }
        }
      ]
    };
    
    // Add additional filters if provided
    if (type) {
      query.$and.push({ type });
    }
    
    if (minPrice || maxPrice) {
      const priceQuery = {};
      if (minPrice) priceQuery.$gte = Number(minPrice);
      if (maxPrice) priceQuery.$lte = Number(maxPrice);

      query.$and.push({
        $or: [
          { 'rooms.price': priceQuery },
          { 'rooms.beds.price': priceQuery }
        ]
      });
    }
    
    // Only include properties that have latitude and longitude
    query.$and.push({ 
      latitude: { $exists: true, $ne: null },
      longitude: { $exists: true, $ne: null }
    });
    
    // Execute query
    const properties = await Property.find(query)
      .select('propertyId name type address city state pinCode latitude longitude images rooms.price')
      .limit(50);
      
    // Format properties for response with distance calculation
    const formattedProperties = properties.map(property => {
      // Calculate distance using Haversine formula
      const R = 6371; // Earth's radius in km
      const dLat = (property.latitude - latitude) * Math.PI / 180;
      const dLon = (property.longitude - longitude) * Math.PI / 180;
      const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(latitude * Math.PI / 180) * Math.cos(property.latitude * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distance = R * c; // Distance in km
      
      // Get lowest price
      let lowestPrice = Infinity;
      property.rooms.forEach(room => {
        if (room.price < lowestPrice) lowestPrice = room.price;
        
        if (room.beds && room.beds.length > 0) {
          room.beds.forEach(bed => {
            if (bed.price < lowestPrice) lowestPrice = bed.price;
          });
        }
      });
      if (lowestPrice === Infinity) lowestPrice = 0;
      
      return {
        id: property._id,
        propertyId: property.propertyId,
        name: property.name,
        type: property.type,
        location: {
          address: property.address,
          city: property.city,
          state: property.state,
          pinCode: property.pinCode,
          latitude: property.latitude,
          longitude: property.longitude
        },
        distance: parseFloat(distance.toFixed(2)), // Distance in km, rounded to 2 decimal places
        lowestPrice,
        images: property.images && property.images.length > 0 ? 
          [property.images[0]] : [] // Just return first image
      };
    });
    
    // Sort by distance
    formattedProperties.sort((a, b) => a.distance - b.distance);
    
    res.json({
      success: true,
      count: formattedProperties.length,
      radius: radiusInKm,
      location: {
        latitude,
        longitude
      },
      properties: formattedProperties
    });
  } catch (err) {
    console.error('Error searching properties by radius:', err.message);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message
    });
  }
};

/**
 * Get all properties with default sorting (newest first) - PUBLIC API
 * @route GET /api/public/all-properties
 */
exports.getAllPropertiesDefault = async (req, res) => {
  try {
    const properties = await Property.find()
      .select('propertyId name type address city state pinCode landmark images totalRooms totalBeds rooms.price rooms.status rooms.type rooms.capacity createdAt')
      .sort({ createdAt: -1 })
      .limit(50);

    // Format response similar to getAllPublicProperties
    const formattedProperties = properties.map(property => {
      // Calculate available rooms and beds
      const availableRooms = property.rooms.filter(room => 
        room.status === 'Available' || room.status === 'Partially Available'
      ).length;
      
      let availableBeds = 0;
      property.rooms.forEach(room => {
        if (room.beds && room.beds.length > 0) {
          availableBeds += room.beds.filter(bed => bed.status === 'Available').length;
        }
      });

      // Get lowest price
      let lowestPrice = Infinity;
      property.rooms.forEach(room => {
        if (room.price < lowestPrice) lowestPrice = room.price;
        
        if (room.beds && room.beds.length > 0) {
          room.beds.forEach(bed => {
            if (bed.price < lowestPrice) lowestPrice = bed.price;
          });
        }
      });
      if (lowestPrice === Infinity) lowestPrice = 0;

      return {
        id: property._id,
        propertyId: property.propertyId,
        name: property.name,
        type: property.type,
        location: {
          address: property.address,
          city: property.city,
          state: property.state,
          pinCode: property.pinCode,
          landmark: property.landmark
        },
        totalRooms: property.totalRooms,
        totalBeds: property.totalBeds,
        availableRooms: availableRooms,
        availableBeds: availableBeds,
        lowestPrice: lowestPrice,
        images: property.images && property.images.length > 0 ? 
          property.images.slice(0, 3) : [], // Return up to 3 images
        hasAvailability: availableRooms > 0 || availableBeds > 0,
        createdAt: property.createdAt
      };
    });

    res.json({
      success: true,
      count: formattedProperties.length,
      properties: formattedProperties
    });
  } catch (err) {
    console.error('Error fetching all properties:', err.message);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message
    });
  }
};

/**
 * Get properties near user's current location - PUBLIC API
 * Uses IP-based geolocation if no coordinates are provided
 * @route GET /api/public/properties/near-me
 */
exports.getPropertiesNearMe = async (req, res) => {
  try {
    let { lat, lng, radius = 10 } = req.query;
    
    // Default coordinates for Bangalore if not provided
    // In a real application, you would use IP-based geolocation
    if (!lat || !lng) {
      // Default to Bangalore coordinates
      lat = 12.9716;
      lng = 77.5946;
    }
    
    // Convert to numbers
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const radiusInKm = parseFloat(radius);
    
    // Validate inputs
    if (isNaN(latitude) || isNaN(longitude) || isNaN(radiusInKm)) {
      return res.status(400).json({
        success: false,
        message: "Invalid coordinates or radius provided"
      });
    }
    
    // Find all properties, prioritizing those with coordinates
    let properties = await Property.find()
      .select('propertyId name type address city state pinCode landmark latitude longitude images rooms.price rooms.status totalRooms totalBeds')
      .sort({ createdAt: -1 });
    
    // Format and calculate distances where possible
    const formattedProperties = properties.map(property => {
      // Calculate distance if property has coordinates
      let distance = null;
      if (property.latitude && property.longitude) {
        // Calculate distance using Haversine formula
        const R = 6371; // Earth's radius in km
        const dLat = (property.latitude - latitude) * Math.PI / 180;
        const dLon = (property.longitude - longitude) * Math.PI / 180;
        const a = 
          Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(latitude * Math.PI / 180) * Math.cos(property.latitude * Math.PI / 180) * 
          Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        distance = R * c; // Distance in km
      }
      
      // Calculate available rooms and beds
      const availableRooms = property.rooms.filter(room => 
        room.status === 'Available' || room.status === 'Partially Available'
      ).length;
      
      let availableBeds = 0;
      let lowestPrice = Infinity;
      
      property.rooms.forEach(room => {
        if (room.price < lowestPrice) lowestPrice = room.price;
        
        if (room.beds && room.beds.length > 0) {
          availableBeds += room.beds.filter(bed => bed.status === 'Available').length;
          
          room.beds.forEach(bed => {
            if (bed.price < lowestPrice) lowestPrice = bed.price;
          });
        }
      });
      
      if (lowestPrice === Infinity) lowestPrice = 0;
      
      return {
        id: property._id,
        propertyId: property.propertyId,
        name: property.name,
        type: property.type,
        location: {
          address: property.address,
          city: property.city,
          state: property.state,
          pinCode: property.pinCode,
          landmark: property.landmark,
          latitude: property.latitude,
          longitude: property.longitude
        },
        distance: distance !== null ? parseFloat(distance.toFixed(2)) : null,
        totalRooms: property.totalRooms,
        totalBeds: property.totalBeds,
        availableRooms: availableRooms,
        availableBeds: availableBeds,
        lowestPrice: lowestPrice,
        images: property.images && property.images.length > 0 ? 
          property.images.slice(0, 3) : [],
        hasAvailability: availableRooms > 0 || availableBeds > 0
      };
    });
    
    // Sort by distance if available, otherwise newest first
    const sortedProperties = formattedProperties.sort((a, b) => {
      if (a.distance !== null && b.distance !== null) {
        return a.distance - b.distance;
      } else if (a.distance !== null) {
        return -1; // Properties with distance come first
      } else if (b.distance !== null) {
        return 1;
      }
      return 0; // Keep original order for properties without coordinates
    });
    
    res.json({
      success: true,
      count: sortedProperties.length,
      location: {
        latitude,
        longitude,
        searchRadius: radiusInKm
      },
      properties: sortedProperties
    });
  } catch (err) {
    console.error('Error fetching nearby properties:', err.message);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message
    });
  }
};
