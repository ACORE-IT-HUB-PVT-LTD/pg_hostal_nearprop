const mongoose = require('mongoose');
const Tenant = require('../models/Tenant');
const Property = require('../models/Property');
const { setCache, getCache } = require('../utils/redis');

/**
 * Get all rooms available for booking
 * Tenants can see all available rooms across all properties
 */
const getAvailableRooms = async (req, res) => {
  try {
    // Get query parameters for filtering
    const { 
      city, minPrice, maxPrice, amenities, type, 
      propertyType, gender, occupancyType, availability,
      sortBy, limit, page
    } = req.query;
    
    // Build query
    const query = {};
    
    // Filter by city if provided
    if (city) {
      query.city = new RegExp(city, 'i'); // Case-insensitive search
    }
    
    // Filter by property type if provided (for backward compatibility)
    if (type) {
      query.propertyType = type;
    }
    
    // Enhanced property type filter (PG, hostel, villa, apartment, etc.)
    if (propertyType) {
      query.propertyType = propertyType;
    }
    
    // Filter by property availability status
    if (availability === 'available') {
      query['rooms.status'] = 'Available';
    }
    
    // Find all properties matching the query with pagination
    const pageNumber = parseInt(page) || 1;
    const pageSize = parseInt(limit) || 20;
    const skip = (pageNumber - 1) * pageSize;
    
    // Build sorting criteria
    let sortOptions = {};
    if (sortBy === 'price_asc') {
      sortOptions = { 'rooms.price': 1 };
    } else if (sortBy === 'price_desc') {
      sortOptions = { 'rooms.price': -1 };
    } else if (sortBy === 'newest') {
      sortOptions = { createdAt: -1 };
    } else {
      sortOptions = { createdAt: -1 }; // Default sorting
    }
    
    // Find all properties matching the query with landlord information
    const properties = await Property.find(query)
      .select('name address city propertyType rooms landlordId description amenities images createdAt updatedAt')
      .populate('landlordId', 'name mobile email')
      .sort(sortOptions)
      .skip(skip)
      .limit(pageSize);
    
    // Get total count for pagination
    const totalCount = await Property.countDocuments(query);
    
    // Filter rooms that are available in each property
    const availableRooms = [];
    
    properties.forEach(property => {
      if (property.rooms && property.rooms.length > 0) {
        property.rooms.forEach(room => {
          // Check if room has available beds or is directly available itself
          const isRoomAvailable = room.status === 'Available';
          const hasAvailableBeds = room.beds && room.beds.some(bed => bed.status === 'Available');
          
          // Apply gender filter if provided
          if (gender && room.gender && room.gender !== gender && room.gender !== 'Any') {
            return; // Skip rooms that don't match the gender preference
          }
          
          // Apply occupancy type filter if provided
          if (occupancyType && room.type && room.type !== occupancyType) {
            return; // Skip rooms that don't match the occupancy type
          }
          
          if (isRoomAvailable || hasAvailableBeds) {
            // Filter by price if provided
            const roomPrice = room.price || 0;
            if ((minPrice && roomPrice < parseInt(minPrice)) || (maxPrice && roomPrice > parseInt(maxPrice))) {
              return; // Skip this room if outside price range
            }
            
            // Filter by amenities if provided
            if (amenities) {
              const amenitiesArray = amenities.split(',');
              // Check both property-level and room-level amenities
              const allAmenities = [
                ...(property.amenities || []), 
                ...(room.amenities || [])
              ];
              const hasAllAmenities = amenitiesArray.every(a => allAmenities.includes(a));
              if (!hasAllAmenities) {
                return; // Skip this room if it doesn't have all required amenities
              }
            }
            
            // Add to available rooms list
            const availableBeds = room.beds ? room.beds.filter(bed => bed.status === 'Available') : [];
            availableRooms.push({
              propertyId: property._id,
              propertyName: property.name,
              propertyAddress: property.address,
              propertyCity: property.city,
              propertyType: property.propertyType,
              propertyDescription: property.description,
              propertyAmenities: property.amenities || [],
              propertyImages: property.images || [],
              landlord: property.landlordId ? {
                id: property.landlordId._id,
                name: property.landlordId.name,
                contact: property.landlordId.mobile,
                email: property.landlordId.email
              } : null,
              roomId: room.roomId,
              roomName: room.name,
              roomType: room.type,
              roomPrice: room.price,
              roomAmenities: room.amenities || [],
              roomStatus: room.status,
              roomGender: room.gender || 'Any',
              availableBeds: availableBeds.map(bed => ({
                bedId: bed.bedId,
                name: bed.name,
                price: bed.price,
                status: bed.status
              }))
            });
          }
        });
      }
    });
    
    return res.status(200).json({
      success: true,
      count: availableRooms.length,
      rooms: availableRooms,
      pagination: {
        currentPage: pageNumber,
        pageSize: pageSize,
        totalPages: Math.ceil(totalCount / pageSize),
        totalCount: totalCount
      }
    });
  } catch (error) {
    console.error('Error in getAvailableRooms:', error);
    return res.status(500).json({
      message: 'Error retrieving available rooms',
      error: error.message
    });
  }
};

/**
 * Get all accommodation details for a tenant
 * Shows all properties where tenant is staying
 */
/**
 * Get properties by type (PG/Hostel/Villa/etc.)
 * This API allows tenants to browse properties by specific type
 */
const getPropertiesByType = async (req, res) => {
  try {
    const { type, city, minPrice, maxPrice, amenities, limit, page } = req.query;
    
    if (!type) {
      return res.status(400).json({ message: 'Property type is required' });
    }
    
    // Build query
    const query = {
      propertyType: type
    };
    
    // Filter by city if provided
    if (city) {
      query.city = new RegExp(city, 'i'); // Case-insensitive search
    }
    
    // Pagination
    const pageNumber = parseInt(page) || 1;
    const pageSize = parseInt(limit) || 20;
    const skip = (pageNumber - 1) * pageSize;
    
    // Get properties
    const properties = await Property.find(query)
      .select('name address city propertyType description amenities images rooms landlordId createdAt updatedAt')
      .populate('landlordId', 'name mobile email')
      .skip(skip)
      .limit(pageSize);
    
    // Get total count for pagination
    const totalCount = await Property.countDocuments(query);
    
    // Process properties to include room/bed availability
    const processedProperties = properties.map(property => {
      // Count available rooms and beds
      let availableRooms = 0;
      let availableBeds = 0;
      let minRoomPrice = Infinity;
      let maxRoomPrice = 0;
      
      if (property.rooms && property.rooms.length > 0) {
        property.rooms.forEach(room => {
          // Update min and max prices
          const roomPrice = room.price || 0;
          if (roomPrice > 0) {
            minRoomPrice = Math.min(minRoomPrice, roomPrice);
            maxRoomPrice = Math.max(maxRoomPrice, roomPrice);
          }
          
          // Count available rooms
          if (room.status === 'Available') {
            availableRooms++;
          }
          
          // Count available beds
          if (room.beds && room.beds.length > 0) {
            room.beds.forEach(bed => {
              if (bed.status === 'Available') {
                availableBeds++;
                
                // Update min and max prices for beds
                const bedPrice = bed.price || 0;
                if (bedPrice > 0) {
                  minRoomPrice = Math.min(minRoomPrice, bedPrice);
                  maxRoomPrice = Math.max(maxRoomPrice, bedPrice);
                }
              }
            });
          }
        });
      }
      
      // Fix the price range if no rooms/beds have prices
      if (minRoomPrice === Infinity) minRoomPrice = 0;
      
      // Filter out properties outside price range if specified
      if ((minPrice && maxRoomPrice < parseInt(minPrice)) || (maxPrice && minRoomPrice > parseInt(maxPrice))) {
        return null; // Will be filtered out later
      }
      
      // Filter by amenities if provided
      if (amenities) {
        const amenitiesArray = amenities.split(',');
        const propertyAmenities = property.amenities || [];
        const hasAllAmenities = amenitiesArray.every(a => propertyAmenities.includes(a));
        if (!hasAllAmenities) {
          return null; // Will be filtered out later
        }
      }
      
      return {
        id: property._id,
        name: property.name,
        address: property.address,
        city: property.city,
        type: property.propertyType,
        description: property.description,
        amenities: property.amenities || [],
        images: property.images || [],
        priceRange: {
          min: minRoomPrice,
          max: maxRoomPrice
        },
        availability: {
          availableRooms,
          availableBeds,
          totalRooms: property.rooms ? property.rooms.length : 0
        },
        landlord: property.landlordId ? {
          id: property.landlordId._id,
          name: property.landlordId.name,
          contact: property.landlordId.mobile,
          email: property.landlordId.email
        } : null
      };
    }).filter(property => property !== null); // Remove filtered-out properties
    
    return res.status(200).json({
      success: true,
      count: processedProperties.length,
      properties: processedProperties,
      pagination: {
        currentPage: pageNumber,
        pageSize: pageSize,
        totalPages: Math.ceil(totalCount / pageSize),
        totalCount: totalCount
      }
    });
  } catch (error) {
    console.error('Error in getPropertiesByType:', error);
    return res.status(500).json({
      message: 'Error retrieving properties',
      error: error.message
    });
  }
};

/**
 * Get detailed property information
 * This API allows tenants to view complete details about a specific property
 */
const getPropertyDetails = async (req, res) => {
  try {
    const { propertyId } = req.params;
    
    if (!propertyId) {
      return res.status(400).json({ message: 'Property ID is required' });
    }
    
    // Get property with landlord details
    const property = await Property.findById(propertyId)
      .populate('landlordId', 'name mobile email');
    
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }
    
    // Process rooms and beds to include availability
    const processedRooms = property.rooms.map(room => {
      // Process beds in the room
      const processedBeds = room.beds ? room.beds.map(bed => {
        return {
          bedId: bed.bedId,
          name: bed.name,
          price: bed.price,
          status: bed.status,
          amenities: bed.amenities || [],
          description: bed.description || '',
          images: bed.images || []
        };
      }) : [];
      
      return {
        roomId: room.roomId,
        name: room.name,
        type: room.type,
        price: room.price,
        status: room.status,
        gender: room.gender || 'Any',
        maxOccupancy: room.maxOccupancy,
        amenities: room.amenities || [],
        description: room.description || '',
        images: room.images || [],
        beds: processedBeds,
        availableBeds: processedBeds.filter(bed => bed.status === 'Available').length
      };
    });
    
    const propertyDetails = {
      id: property._id,
      name: property.name,
      address: property.address,
      city: property.city,
      state: property.state,
      zipCode: property.zipCode,
      type: property.propertyType,
      description: property.description || '',
      amenities: property.amenities || [],
      images: property.images || [],
      rules: property.rules || [],
      landlord: property.landlordId ? {
        id: property.landlordId._id,
        name: property.landlordId.name,
        contact: property.landlordId.mobile,
        email: property.landlordId.email
      } : null,
      rooms: processedRooms,
      availability: {
        availableRooms: processedRooms.filter(room => room.status === 'Available').length,
        availableBeds: processedRooms.reduce((total, room) => total + room.availableBeds, 0),
        totalRooms: processedRooms.length
      }
    };
    
    return res.status(200).json({
      success: true,
      property: propertyDetails
    });
  } catch (error) {
    console.error('Error in getPropertyDetails:', error);
    return res.status(500).json({
      message: 'Error retrieving property details',
      error: error.message
    });
  }
};

const getTenantAccommodations = async (req, res) => {
  try {
    // Get tenant ID from auth or params
    const tenantId = req.params.tenantId || req.tenant?.tenantId;
    
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }
    
    // Get tenant with populated accommodations
    const tenant = await Tenant.findOne({ tenantId });
    
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    // Check if this is the tenant's own data or a landlord with access
    if (req.user.role !== 'landlord' && req.user.id !== tenantId) {
      return res.status(403).json({ message: 'Unauthorized to access this data' });
    }
    
    // Get detailed information for each accommodation
    const detailedAccommodations = [];
    
    if (tenant.accommodations && tenant.accommodations.length > 0) {
      // Fetch property details for all accommodations at once
      const propertyIds = tenant.accommodations.map(acc => acc.propertyId);
      const properties = await Property.find({ 
        _id: { $in: propertyIds } 
      }).select('name address city propertyType rooms');
      
      // Create a map for quick lookup
      const propertyMap = {};
      properties.forEach(property => {
        propertyMap[property._id.toString()] = property;
      });
      
      // Build detailed accommodations
      tenant.accommodations.forEach(accommodation => {
        const property = propertyMap[accommodation.propertyId.toString()];
        
        if (property) {
          // Find the specific room
          const room = property.rooms.find(r => r.roomId === accommodation.roomId);
          
          // Find the specific bed if applicable
          let bed = null;
          if (accommodation.bedId && room && room.beds) {
            bed = room.beds.find(b => b.bedId === accommodation.bedId);
          }
          
          detailedAccommodations.push({
            landlordId: accommodation.landlordId,
            propertyId: accommodation.propertyId,
            propertyName: property.name,
            propertyAddress: property.address,
            propertyCity: property.city,
            roomId: accommodation.roomId,
            roomName: room ? room.name : 'Unknown',
            roomType: room ? room.type : 'Unknown',
            bedId: accommodation.bedId,
            bedName: bed ? bed.name : null,
            moveInDate: accommodation.moveInDate,
            moveOutDate: accommodation.moveOutDate,
            rentAmount: accommodation.rentAmount,
            securityDeposit: accommodation.securityDeposit,
            pendingDues: accommodation.pendingDues,
            isActive: accommodation.isActive,
            localTenantId: accommodation.localTenantId
          });
        }
      });
    }
    
    return res.status(200).json({
      success: true,
      count: detailedAccommodations.length,
      accommodations: detailedAccommodations
    });
  } catch (error) {
    console.error('Error in getTenantAccommodations:', error);
    return res.status(500).json({
      message: 'Error retrieving tenant accommodations',
      error: error.message
    });
  }
};

/**
 * Get all booking requests made by a tenant
 */
const getTenantBookingRequests = async (req, res) => {
  try {
    // Get tenant ID from auth or params
    const tenantId = req.params.tenantId || req.tenant?.tenantId;
    
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }
    
    // Get tenant booking requests
    const tenant = await Tenant.findOne({ tenantId });
    
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    // Check if this is the tenant's own data or a landlord with access
    if (req.user.role !== 'landlord' && req.user.id !== tenantId) {
      return res.status(403).json({ message: 'Unauthorized to access this data' });
    }
    
    // If tenant has no booking requests
    if (!tenant.bookingRequests || tenant.bookingRequests.length === 0) {
      return res.status(200).json({
        success: true,
        count: 0,
        bookingRequests: []
      });
    }
    
    // Get property details for the booking requests
    const propertyIds = tenant.bookingRequests.map(req => req.propertyId);
    const properties = await Property.find({ 
      _id: { $in: propertyIds } 
    }).select('name address city');
    
    // Create a map for quick lookup
    const propertyMap = {};
    properties.forEach(property => {
      propertyMap[property._id.toString()] = property;
    });
    
    // Enhance booking requests with property details
    const enhancedRequests = tenant.bookingRequests.map(request => {
      const property = propertyMap[request.propertyId.toString()];
      
      return {
        requestId: request.requestId,
        propertyId: request.propertyId,
        propertyName: property ? property.name : request.propertyName,
        propertyAddress: property ? property.address : 'Unknown',
        propertyCity: property ? property.city : 'Unknown',
        roomId: request.roomId,
        bedId: request.bedId,
        landlordId: request.landlordId,
        status: request.status,
        moveInDate: request.moveInDate,
        duration: request.duration,
        message: request.message,
        requestDate: request.requestDate,
        responseDate: request.responseDate,
        responseMessage: request.responseMessage
      };
    });
    
    // Sort by requestDate (newest first)
    enhancedRequests.sort((a, b) => new Date(b.requestDate) - new Date(a.requestDate));
    
    return res.status(200).json({
      success: true,
      count: enhancedRequests.length,
      bookingRequests: enhancedRequests
    });
  } catch (error) {
    console.error('Error in getTenantBookingRequests:', error);
    return res.status(500).json({
      message: 'Error retrieving tenant booking requests',
      error: error.message
    });
  }
};

/**
 * Cancel a booking request
 */
const cancelBookingRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    
    if (!requestId) {
      return res.status(400).json({ message: 'Request ID is required' });
    }
    
    // Find tenant with this booking request
    const tenant = await Tenant.findOne({
      'bookingRequests.requestId': requestId
    });
    
    if (!tenant) {
      return res.status(404).json({ message: 'Booking request not found' });
    }
    
    // Check if this is the tenant's own request
    if (tenant.tenantId !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized to cancel this booking request' });
    }
    
    // Find the booking request
    const bookingRequestIndex = tenant.bookingRequests.findIndex(req => req.requestId === requestId);
    
    if (bookingRequestIndex === -1) {
      return res.status(404).json({ message: 'Booking request not found' });
    }
    
    // Check if the request can be cancelled (only pending requests can be cancelled)
    if (tenant.bookingRequests[bookingRequestIndex].status !== 'Pending') {
      return res.status(400).json({ 
        message: `Cannot cancel booking request with status: ${tenant.bookingRequests[bookingRequestIndex].status}` 
      });
    }
    
    // Update status to Cancelled
    tenant.bookingRequests[bookingRequestIndex].status = 'Cancelled';
    tenant.bookingRequests[bookingRequestIndex].responseDate = new Date();
    tenant.bookingRequests[bookingRequestIndex].responseMessage = 'Cancelled by tenant';
    
    await tenant.save();
    
    return res.status(200).json({
      message: 'Booking request cancelled successfully',
      bookingRequest: tenant.bookingRequests[bookingRequestIndex]
    });
  } catch (error) {
    console.error('Error in cancelBookingRequest:', error);
    return res.status(500).json({
      message: 'Error cancelling booking request',
      error: error.message
    });
  }
};

/**
 * Get tenant's bills summary - with payment history and pending dues
 */
const getTenantBillsSummary = async (req, res) => {
  try {
    // Get tenant ID from auth or params
    const tenantId = req.params.tenantId || req.tenant?.tenantId;
    
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }
    
    // Get tenant with bills
    const tenant = await Tenant.findOne({ tenantId });
    
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    // Check if this is the tenant's own data or a landlord with access
    if (req.user.role !== 'landlord' && req.user.id !== tenantId) {
      return res.status(403).json({ message: 'Unauthorized to access this data' });
    }
    
    // Calculate summary
    const billSummary = {
      totalBills: 0,
      totalPaid: 0,
      totalPending: 0,
      pendingBills: [],
      paidBills: [],
      billsByType: {},
      billsByProperty: {}
    };
    
    // Process bills if any
    if (tenant.bills && tenant.bills.length > 0) {
      tenant.bills.forEach(bill => {
        billSummary.totalBills += bill.amount || 0;
        
        // Categorize by payment status
        if (bill.paid) {
          billSummary.totalPaid += bill.paidAmount || 0;
          billSummary.paidBills.push({
            billNumber: bill.billNumber,
            type: bill.type,
            amount: bill.amount,
            paidAmount: bill.paidAmount,
            paidDate: bill.paidDate,
            paymentMethod: bill.paymentMethod,
            transactionId: bill.transactionId,
            propertyName: bill.propertyName,
            month: bill.month,
            year: bill.year
          });
        } else {
          billSummary.totalPending += bill.amount || 0;
          billSummary.pendingBills.push({
            billNumber: bill.billNumber,
            type: bill.type,
            amount: bill.amount,
            dueDate: bill.dueDate,
            propertyName: bill.propertyName,
            month: bill.month,
            year: bill.year
          });
        }
        
        // Group by type
        if (!billSummary.billsByType[bill.type]) {
          billSummary.billsByType[bill.type] = {
            total: 0,
            paid: 0,
            pending: 0
          };
        }
        billSummary.billsByType[bill.type].total += bill.amount || 0;
        if (bill.paid) {
          billSummary.billsByType[bill.type].paid += bill.paidAmount || 0;
        } else {
          billSummary.billsByType[bill.type].pending += bill.amount || 0;
        }
        
        // Group by property
        const propertyKey = `${bill.propertyId}`;
        if (!billSummary.billsByProperty[propertyKey]) {
          billSummary.billsByProperty[propertyKey] = {
            propertyId: bill.propertyId,
            propertyName: bill.propertyName,
            total: 0,
            paid: 0,
            pending: 0
          };
        }
        billSummary.billsByProperty[propertyKey].total += bill.amount || 0;
        if (bill.paid) {
          billSummary.billsByProperty[propertyKey].paid += bill.paidAmount || 0;
        } else {
          billSummary.billsByProperty[propertyKey].pending += bill.amount || 0;
        }
      });
    }
    
    return res.status(200).json({
      success: true,
      tenantId: tenant.tenantId,
      name: tenant.name,
      billSummary
    });
  } catch (error) {
    console.error('Error in getTenantBillsSummary:', error);
    return res.status(500).json({
      message: 'Error retrieving tenant bills summary',
      error: error.message
    });
  }
};

/**
 * Get tenant profile - for tenant to view their own profile
 */
const getTenantProfile = async (req, res) => {
  try {
    // Get tenant ID from auth
    const tenantId = req.user.id;
    
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }
    
    // Get tenant details (excluding sensitive information)
    const tenant = await Tenant.findOne({ tenantId }).select('-photo -idProofs.documentUrl');
    
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    return res.status(200).json({
      success: true,
      tenant: {
        tenantId: tenant.tenantId,
        name: tenant.name,
        email: tenant.email,
        mobile: tenant.mobile,
        permanentAddress: tenant.permanentAddress,
        work: tenant.work,
        dob: tenant.dob,
        maritalStatus: tenant.maritalStatus,
        emergencyContact: tenant.emergencyContact,
        createdAt: tenant.createdAt
      }
    });
  } catch (error) {
    console.error('Error in getTenantProfile:', error);
    return res.status(500).json({
      message: 'Error retrieving tenant profile',
      error: error.message
    });
  }
};

/**
 * Get tenant rooms across all landlords
 * A tenant may have multiple rooms across different properties and landlords
 */
const getTenantRooms = async (req, res) => {
  try {
    // Get tenant ID from auth
    const tenantId = req.user.id;
    
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }
    
    // Get tenant with accommodations
    const tenant = await Tenant.findOne({ tenantId });
    
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    // Get detailed information for each accommodation grouped by landlord
    const accommodationsByLandlord = {};
    
    if (tenant.accommodations && tenant.accommodations.length > 0) {
      // Fetch property details for all accommodations at once
      const propertyIds = tenant.accommodations.map(acc => acc.propertyId);
      const properties = await Property.find({ 
        _id: { $in: propertyIds } 
      }).select('name address city propertyType rooms landlordId');
      
      // Create a map for quick lookup
      const propertyMap = {};
      properties.forEach(property => {
        propertyMap[property._id.toString()] = property;
      });
      
      // Organize accommodations by landlord
      tenant.accommodations.forEach(accommodation => {
        const property = propertyMap[accommodation.propertyId.toString()];
        
        if (property) {
          // Find the specific room
          const room = property.rooms.find(r => r.roomId === accommodation.roomId);
          
          // Find the specific bed if applicable
          let bed = null;
          if (accommodation.bedId && room && room.beds) {
            bed = room.beds.find(b => b.bedId === accommodation.bedId);
          }
          
          const landlordId = property.landlordId.toString();
          if (!accommodationsByLandlord[landlordId]) {
            accommodationsByLandlord[landlordId] = [];
          }
          
          accommodationsByLandlord[landlordId].push({
            propertyId: property._id,
            propertyName: property.name,
            propertyAddress: property.address,
            propertyCity: property.city,
            propertyType: property.propertyType,
            roomId: accommodation.roomId,
            roomName: room ? room.name : 'Unknown',
            roomType: room ? room.type : 'Unknown',
            bedId: accommodation.bedId,
            bedName: bed ? bed.name : null,
            moveInDate: accommodation.moveInDate,
            rentAmount: accommodation.rentAmount,
            securityDeposit: accommodation.securityDeposit,
            isActive: accommodation.isActive,
            localTenantId: accommodation.localTenantId
          });
        }
      });
    }
    
    return res.status(200).json({
      success: true,
      tenantId: tenant.tenantId,
      name: tenant.name,
      accommodationsByLandlord
    });
  } catch (error) {
    console.error('Error in getTenantRooms:', error);
    return res.status(500).json({
      message: 'Error retrieving tenant rooms',
      error: error.message
    });
  }
};

/**
 * Get all landlords a tenant is associated with
 */
const getTenantLandlords = async (req, res) => {
  try {
    // Get tenant ID from auth
    const tenantId = req.user.id;
    
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }
    
    // Get tenant with accommodations
    const tenant = await Tenant.findOne({ tenantId });
    
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    // Get all landlord IDs
    const landlordIds = tenant.accommodations.map(acc => acc.landlordId);
    
    // Remove duplicates
    const uniqueLandlordIds = [...new Set(landlordIds.map(id => id.toString()))];
    
    // Get landlord details
    const Landlord = mongoose.model('Landlord');
    const landlords = await Landlord.find({
      _id: { $in: uniqueLandlordIds }
    }).select('name mobile email');
    
    return res.status(200).json({
      success: true,
      count: landlords.length,
      landlords: landlords.map(landlord => ({
        landlordId: landlord._id,
        name: landlord.name,
        mobile: landlord.mobile,
        email: landlord.email
      }))
    });
  } catch (error) {
    console.error('Error in getTenantLandlords:', error);
    return res.status(500).json({
      message: 'Error retrieving tenant landlords',
      error: error.message
    });
  }
};

module.exports = {
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
};
