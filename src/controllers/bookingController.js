const mongoose = require('mongoose');
const Tenant = require('../models/Tenant');
const Property = require('../models/Property');
const { setCache, getCache } = require('../utils/redis');

/**
 * Get all tenants who have been added but not assigned to any property
 */
const getPendingTenants = async (req, res) => {
  try {
    // Find tenants with empty accommodations array (not assigned to any property)
    // Only for the current landlord
    const tenants = await Tenant.find({
      accommodations: { $size: 0 }  // Find tenants with empty accommodations array
    }).select('-photo'); // Exclude photo to reduce response size

    return res.status(200).json({
      success: true,
      count: tenants.length,
      tenants: tenants.map(tenant => ({
        tenantId: tenant.tenantId,
        name: tenant.name,
        email: tenant.email,
        mobile: tenant.mobile,
        aadhaar: tenant.aadhaar,
        work: tenant.work,
        dob: tenant.dob,
        maritalStatus: tenant.maritalStatus,
        createdAt: tenant.createdAt,
      }))
    });
  } catch (error) {
    console.error('Error in getPendingTenants:', error);
    return res.status(500).json({
      message: 'Error retrieving pending tenants',
      error: error.message
    });
  }
};

/**
 * Get all booking requests for a landlord
 */
const getBookingRequests = async (req, res) => {
  try {
    const landlordId = req.user.id;
    
    // Find all tenants who have booking requests for this landlord's properties
    const tenants = await Tenant.find({
      'bookingRequests.landlordId': new mongoose.Types.ObjectId(landlordId),
    }).select('name email mobile tenantId bookingRequests');

    // Extract and format booking requests
    const bookingRequests = [];
    tenants.forEach(tenant => {
      tenant.bookingRequests.forEach(request => {
        // Only include requests for this landlord
        if (request.landlordId.toString() === landlordId) {
          bookingRequests.push({
            requestId: request.requestId,
            tenantId: tenant.tenantId,
            tenantName: tenant.name,
            tenantEmail: tenant.email,
            tenantMobile: tenant.mobile,
            propertyId: request.propertyId,
            propertyName: request.propertyName,
            roomId: request.roomId,
            bedId: request.bedId,
            status: request.status,
            moveInDate: request.moveInDate,
            duration: request.duration,
            message: request.message,
            requestDate: request.requestDate,
            responseDate: request.responseDate,
            responseMessage: request.responseMessage
          });
        }
      });
    });

    // Sort by requestDate (newest first)
    bookingRequests.sort((a, b) => new Date(b.requestDate) - new Date(a.requestDate));

    return res.status(200).json({
      success: true,
      count: bookingRequests.length,
      bookingRequests
    });
  } catch (error) {
    console.error('Error in getBookingRequests:', error);
    return res.status(500).json({
      message: 'Error retrieving booking requests',
      error: error.message
    });
  }
};

/**
 * Submit a booking request for a property
 */
const submitBookingRequest = async (req, res) => {
  try {
    const { 
      tenantId, propertyId, roomId, bedId, moveInDate, duration, message,
      requestType, preferredRentAmount, specialRequirements, occupancyType,
      expectedMoveInDate, expectedDuration, alternateContact, documents
    } = req.body;

    // Validate required fields
    if (!tenantId || !propertyId) {
      return res.status(400).json({
        message: 'Tenant ID and Property ID are required',
      });
    }

    // Find the tenant
    const tenant = await Tenant.findOne({ tenantId });
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }

    // Find the property to get property details and landlord info
    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }
    
    // Find room details if provided
    let roomDetails = null;
    if (roomId) {
      roomDetails = property.rooms.find(room => room.roomId === roomId);
      if (!roomDetails) {
        return res.status(404).json({ message: 'Room not found in this property' });
      }
    }
    
    // Find bed details if provided
    let bedDetails = null;
    if (roomDetails && bedId) {
      bedDetails = roomDetails.beds.find(bed => bed.bedId === bedId);
      if (!bedDetails) {
        return res.status(404).json({ message: 'Bed not found in this room' });
      }
    }

    // Check if tenant already has a pending request for this property
    const existingRequest = tenant.bookingRequests.find(
      req => req.propertyId.toString() === propertyId && 
             req.status === 'Pending' && 
             (roomId ? req.roomId === roomId : true) &&
             (bedId ? req.bedId === bedId : true)
    );

    if (existingRequest) {
      return res.status(400).json({
        message: 'You already have a pending booking request for this property'
      });
    }

    // Create a new booking request with enhanced fields
    const bookingRequest = {
      propertyId,
      propertyName: property.name,
      propertyType: property.propertyType,
      roomId,
      roomName: roomDetails ? roomDetails.name : undefined,
      roomType: roomDetails ? roomDetails.type : undefined,
      bedId,
      bedName: bedDetails ? bedDetails.name : undefined,
      landlordId: property.landlordId,
      status: 'Pending',
      moveInDate: moveInDate ? new Date(moveInDate) : 
                 expectedMoveInDate ? new Date(expectedMoveInDate) : new Date(),
      duration: duration || expectedDuration || 1, // Default to 1 month
      message,
      requestDate: new Date(),
      // Enhanced fields
      requestType: requestType || 'Standard', // Standard, Urgent, Long-term, Short-term
      preferredRentAmount: preferredRentAmount, // Tenant's budget
      specialRequirements: specialRequirements || '', // Any special needs
      occupancyType: occupancyType || (roomDetails ? roomDetails.type : ''), // Single, Double, Triple, etc.
      alternateContact: alternateContact || tenant.mobile, // Alternative contact number
      documents: documents || [] // Any uploaded document references
    };

    // Add the booking request to the tenant's bookingRequests array
    tenant.bookingRequests.push(bookingRequest);
    await tenant.save();
    
    // Get the latest booking request (the one we just added)
    const newRequest = tenant.bookingRequests[tenant.bookingRequests.length - 1];

    return res.status(201).json({
      success: true,
      message: 'Booking request submitted successfully',
      request: {
        requestId: newRequest.requestId,
        propertyName: newRequest.propertyName,
        propertyType: newRequest.propertyType,
        roomName: newRequest.roomName,
        status: newRequest.status,
        moveInDate: newRequest.moveInDate,
        requestDate: newRequest.requestDate
      }
    });
  } catch (error) {
    console.error('Error in submitBookingRequest:', error);
    return res.status(500).json({
      message: 'Error submitting booking request',
      error: error.message
    });
  }
};

/**
 * Update a booking request status (approve/reject)
 */
const updateBookingRequest = async (req, res) => {
  try {
    const { requestId, status, responseMessage } = req.body;
    const landlordId = req.user.id;

    // Validate inputs
    if (!requestId || !status) {
      return res.status(400).json({ message: 'Request ID and status are required' });
    }

    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ message: 'Status must be either Approved or Rejected' });
    }

    // Find the tenant with the given booking request
    const tenant = await Tenant.findOne({
      'bookingRequests.requestId': requestId,
      'bookingRequests.landlordId': new mongoose.Types.ObjectId(landlordId)
    });

    if (!tenant) {
      return res.status(404).json({ message: 'Booking request not found' });
    }

    // Find the booking request
    const bookingRequestIndex = tenant.bookingRequests.findIndex(
      req => req.requestId === requestId && req.landlordId.toString() === landlordId
    );

    if (bookingRequestIndex === -1) {
      return res.status(404).json({ message: 'Booking request not found' });
    }

    // Update the booking request
    tenant.bookingRequests[bookingRequestIndex].status = status;
    tenant.bookingRequests[bookingRequestIndex].responseDate = new Date();
    tenant.bookingRequests[bookingRequestIndex].responseMessage = responseMessage || '';

    // If approved, we could automatically assign the tenant to the property
    // But for now, we'll leave that as a separate step
    
    await tenant.save();

    return res.status(200).json({
      message: `Booking request ${status.toLowerCase()} successfully`,
      bookingRequest: tenant.bookingRequests[bookingRequestIndex]
    });
  } catch (error) {
    console.error('Error in updateBookingRequest:', error);
    return res.status(500).json({
      message: 'Error updating booking request',
      error: error.message
    });
  }
};

module.exports = {
  getPendingTenants,
  getBookingRequests,
  submitBookingRequest,
  updateBookingRequest
};
``