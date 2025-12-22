/**
 * Visit Controller - Handles scheduling and managing property visits
 */
const Visit = require('../models/Visit');
const Property = require('../models/Property');
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const Landlord = require('../models/Landlord');
const mongoose = require('mongoose');
const visitNotificationService = require('../services/visitNotificationService');

/**
 * Helper function to find a user by ID across multiple user models
 */
const findUserById = async (userId) => {
  if (!userId) return null;
  
  let user = null;
  
  // Try User model
  try {
    user = await User.findById(userId);
    if (user) return user;
  } catch (err) {
    console.log(`Error finding user in User model: ${err.message}`);
  }
  
  // Try Tenant model
  try {
    user = await Tenant.findById(userId);
    if (user) return user;
  } catch (err) {
    console.log(`Error finding user in Tenant model: ${err.message}`);
  }
  
  // Try Landlord model
  try {
    user = await Landlord.findById(userId);
    if (user) return user;
  } catch (err) {
    console.log(`Error finding user in Landlord model: ${err.message}`);
  }
  
  return null;
};

/**
 * Create a new visit schedule (for users)
 */
const createVisit = async (req, res) => {
  try {
    const { propertyId, visitDate, notes } = req.body;
    const userId = req.user.id;

    // Validate inputs
    if (!propertyId || !visitDate) {
      return res.status(400).json({
        success: false,
        message: 'Property ID and visit date are required'
      });
    }

    // Validate date format
    const visitDateObj = new Date(visitDate);
    if (isNaN(visitDateObj.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format'
      });
    }

    // Check if property exists
    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }

    // Check if date is in current month
    const currentMonth = new Date().getMonth();
    const selectedMonth = visitDateObj.getMonth();
    const currentYear = new Date().getFullYear();
    const selectedYear = visitDateObj.getFullYear();

    if (selectedMonth !== currentMonth || selectedYear !== currentYear) {
      return res.status(400).json({
        success: false,
        message: 'Visit date must be in the current month'
      });
    }

    // Check if date is in the past
    if (visitDateObj < new Date().setHours(0, 0, 0, 0)) {
      return res.status(400).json({
        success: false,
        message: 'Visit date cannot be in the past'
      });
    }

    // Create visit
    const visit = new Visit({
      userId,
      propertyId,
      landlordId: property.landlordId,
      visitDate: visitDateObj,
      notes,
      status: 'pending'
    });

    await visit.save();
    
    // Find user info for notification
    let user = null;
    
    // Try to find in User model first
    try {
      user = await User.findById(userId);
    } catch (err) {
      console.log('User model not found or error:', err.message);
    }
    
    // If not found in User, try Tenant model
    if (!user) {
      try {
        user = await Tenant.findOne({ _id: userId });
      } catch (err) {
        console.log('Tenant not found or error:', err.message);
      }
    }
    
    // If still no user info, use what we have from the request
    if (!user) {
      user = {
        _id: req.user.id,
        name: req.user.name || 'User',
        email: req.user.email || '',
        mobile: req.user.mobile || ''
      };
    }
    
    // Send notification to landlord
    try {
      await visitNotificationService.notifyVisitScheduled(visit, property, user);
    } catch (notifError) {
      console.error('Failed to send notification:', notifError);
      // Non-blocking error - we continue even if notification fails
    }

    // Return success response
    return res.status(201).json({
      success: true,
      message: 'Visit scheduled successfully',
      visit
    });
  } catch (error) {
    console.error('Error creating visit:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Get all visits for a user (My Visits)
 */
const getUserVisits = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const { status, sort = 'visitDate', order = 'desc', limit = 10, page = 1 } = req.query;
    
    console.log('User Visits Request - User ID:', userId, 'Role:', userRole);
    console.log('Query params:', req.query);
    
    // Check if userId is valid
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    // Build the query
    let query = {};
    
    // If user is a landlord, they might want to see visits for properties they own
    if (userRole === 'landlord') {
      console.log('Landlord accessing user visits API');
      // For landlords, show visits where they are the landlordId
      query = { landlordId: userId };
    } else {
      // For regular users, show their own visits
      query = { userId };
    }
    
    // Add status filter if provided (case-insensitive)
    if (status) {
      const normalizedStatus = status.toLowerCase();
      if (['pending', 'confirmed', 'cancelled', 'completed'].includes(normalizedStatus)) {
        query.status = normalizedStatus;
      }
    }
    
    console.log('Final query:', JSON.stringify(query));
    
    // Build sort object
    const sortField = sort || 'visitDate';
    const sortOrder = order === 'asc' ? 1 : -1;
    const sortObj = { [sortField]: sortOrder };
    
    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    // Debug log the query being applied
    console.log('User Visits Query:', JSON.stringify(query));
    console.log('Sort:', JSON.stringify(sortObj));
    console.log('Skip:', skip, 'Limit:', limitNum);
    
    // Get user visits with property details
    const visits = await Visit.find(query)
      .sort(sortObj)
      .skip(skip)
      .limit(limitNum)
      .populate({
        path: 'propertyId',
        select: 'name address photos propertyType rent deposit'
      })
      .populate({
        path: 'landlordId',
        select: 'name mobile email'
      })
      .lean();
      
    // Get total count for pagination
    const totalCount = await Visit.countDocuments(query);
    
    // Format the response data
    const formattedVisits = visits.map(visit => {
      // Convert dates to readable format
      const visitDate = new Date(visit.visitDate);
      const formattedDate = `${visitDate.toDateString()} at ${visitDate.toLocaleTimeString()}`;
      
      // Create a human-readable status
      const statusMap = {
        'pending': 'Pending Confirmation',
        'confirmed': 'Confirmed',
        'cancelled': 'Cancelled',
        'completed': 'Completed'
      };
      
      return {
        ...visit,
        visitDateFormatted: formattedDate,
        statusText: statusMap[visit.status] || visit.status,
        // Add relative time for easier understanding
        isUpcoming: visitDate > new Date(),
        isPast: visitDate < new Date()
      };
    });
    
    return res.status(200).json({
      success: true,
      message: 'Visits fetched successfully',
      totalVisits: totalCount,
      visits: formattedVisits,
      pagination: {
        page: parseInt(page),
        limit: limitNum,
        totalPages: Math.ceil(totalCount / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching user visits:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Get all visits for a landlord's properties
 */
const getLandlordVisits = async (req, res) => {
  try {
    // Make this more robust - handle both ObjectId and string ID
    const landlordId = req.landlord._id || req.landlord.id;
    
    if (!landlordId) {
      return res.status(400).json({
        success: false,
        message: 'Landlord ID is required'
      });
    }

    // Get query parameters for filtering
    const { status, propertyId, startDate, endDate, sort = 'visitDate', order = 'desc', limit = 10, page = 1 } = req.query;
    
    // Build the query
    const query = { landlordId };
    
    // Add status filter if provided (case-insensitive)
    if (status) {
      const normalizedStatus = status.toLowerCase();
      if (['pending', 'confirmed', 'cancelled', 'completed'].includes(normalizedStatus)) {
        query.status = normalizedStatus;
      }
    }
    
    // Add property filter if provided
    if (propertyId) {
      query.propertyId = propertyId;
    }
    
    // Add date range filters if provided
    if (startDate || endDate) {
      query.visitDate = {};
      
      if (startDate) {
        query.visitDate.$gte = new Date(startDate);
      }
      
      if (endDate) {
        query.visitDate.$lte = new Date(endDate);
      }
    }
    
    // Build sort object
    const sortField = sort || 'visitDate';
    const sortOrder = order === 'asc' ? 1 : -1;
    const sortObj = { [sortField]: sortOrder };
    
    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);
    
    console.log('Landlord visits query:', query);
    
    // Get visits with user and property details
    const visits = await Visit.find(query)
      .sort(sortObj)
      .skip(skip)
      .limit(limitNum)
      .populate([
        // Try all possible user models for population
        {
          path: 'userId',
          select: 'name mobile email profilePicture',
          model: 'User'
        },
        {
          path: 'userId',
          select: 'name mobile email profilePicture',
          model: 'Tenant' 
        },
        {
          path: 'userId',
          select: 'name mobile email profilePicture',
          model: 'Landlord'
        }
      ])
      .populate({
        path: 'propertyId',
        select: 'name address photos propertyType rent deposit'
      })
      .lean();
      
    // Get total count for pagination
    const totalCount = await Visit.countDocuments(query);
    
    // Add status counts for dashboard overview
    const statusCounts = {
      pending: await Visit.countDocuments({ ...query, status: 'pending' }),
      confirmed: await Visit.countDocuments({ ...query, status: 'confirmed' }),
      cancelled: await Visit.countDocuments({ ...query, status: 'cancelled' }),
      completed: await Visit.countDocuments({ ...query, status: 'completed' }),
      total: visits.length
    };
    
    // Fetch additional user details for visits where userId might be null
    // or population didn't work properly
    const enhancedVisits = await Promise.all(visits.map(async (visit) => {
      // Extract actual user ID from visit
      let actualUserId = visit.userId;
      if (visit.userId && visit.userId._id) {
        actualUserId = visit.userId._id;
      } else if (typeof visit.userId === 'string' || visit.userId instanceof mongoose.Types.ObjectId) {
        actualUserId = visit.userId;
      }
      
      // Only try to find user if userId object is missing or incomplete
      if (!visit.userId || !visit.userId.name || !visit.userId.email || !visit.userId.mobile) {
        console.log(`Finding user details for visit ${visit._id}, userId:`, actualUserId);
        const userDetails = await findUserById(actualUserId);
        if (userDetails) {
          console.log(`Found user details:`, userDetails.name, userDetails.email);
          visit.userId = {
            _id: userDetails._id,
            name: userDetails.name || 'Unknown',
            mobile: userDetails.mobile || 'N/A',
            email: userDetails.email || 'N/A'
          };
        }
      }
      return visit;
    }));
    
    // Group visits by date for calendar view
    const visitsByDate = {};
    visits.forEach(visit => {
      const dateKey = new Date(visit.visitDate).toDateString();
      if (!visitsByDate[dateKey]) {
        visitsByDate[dateKey] = [];
      }
      visitsByDate[dateKey].push(visit);
    });
    
    // Format the response
    const formattedVisits = visits.map(visit => {
      const visitDate = new Date(visit.visitDate);
      
      // If userId is null, try to find the user by looking up both User and Tenant collections
      let userInfo = { name: 'Unknown User' };
      if (visit.userId) {
        userInfo = visit.userId;
      }
      
      console.log(`Visit ${visit._id} - User info:`, userInfo);
      
      return {
        ...visit,
        visitDateFormatted: `${visitDate.toDateString()} at ${visitDate.toLocaleTimeString()}`,
        userInfo: userInfo,
        propertyInfo: visit.propertyId || { name: 'Unknown Property' },
        isToday: new Date().toDateString() === visitDate.toDateString(),
        isPending: visit.status === 'pending'
      };
    });
    
    // Use the enhanced visits with user details in the formatted results
    const finalVisits = enhancedVisits.map(visit => {
      const visitDate = new Date(visit.visitDate);
      
      // Get user info from the enhanced data
      let userInfo = { name: 'Unknown User' };
      if (visit.userId) {
        userInfo = visit.userId;
      }
      
      return {
        ...visit,
        visitDateFormatted: `${visitDate.toDateString()} at ${visitDate.toLocaleTimeString()}`,
        userInfo: userInfo,
        propertyInfo: visit.propertyId || { name: 'Unknown Property' },
        isToday: new Date().toDateString() === visitDate.toDateString(),
        isPending: visit.status === 'pending'
      };
    });
    
    return res.status(200).json({
      success: true,
      message: 'Landlord visits fetched successfully',
      totalVisits: totalCount,
      statusCounts,
      visitsByDate,
      visits: finalVisits, // Use the enhanced visits instead of formattedVisits
      pagination: {
        page: parseInt(page),
        limit: limitNum,
        totalPages: Math.ceil(totalCount / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching landlord visits:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Confirm a visit (landlord only)
 */
const confirmVisit = async (req, res) => {
  try {
    const { visitId } = req.params;
    const { confirmationNotes, meetingPoint } = req.body;
    
    console.log('Confirm Visit Request - User:', req.user);
    console.log('Confirm Visit Request - Landlord:', req.landlord);
    
    if (!visitId) {
      return res.status(400).json({
        success: false,
        message: 'Visit ID is required'
      });
    }
    
    // Get landlordId from req.landlord if available, otherwise fall back to user ID
    let landlordId;
    
    if (req.landlord && (req.landlord._id || req.landlord.id)) {
      landlordId = req.landlord._id || req.landlord.id;
    } else if (req.user && req.user.role === 'landlord') {
      // Use the user ID as landlord ID if role is landlord
      landlordId = req.user.id;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Landlord ID is required'
      });
    }
    
    // First fetch the visit by ID
    const visit = await Visit.findById(visitId);
    
    if (!visit) {
      return res.status(404).json({
        success: false,
        message: 'Visit not found'
      });
    }
    
    // Now check if the landlord is authorized
    console.log('Visit landlordId:', visit.landlordId.toString());
    console.log('User landlordId:', landlordId.toString());
    
    // Convert both IDs to string for comparison
    const visitLandlordId = visit.landlordId.toString();
    const userLandlordId = landlordId.toString();
    
    // Allow admin or the correct landlord
    const isAuthorized = (req.user.role === 'admin') || (visitLandlordId === userLandlordId);
    
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to confirm this visit'
      });
    }
    
    // Check if visit is already confirmed or cancelled
    if (visit.status === 'confirmed') {
      return res.status(400).json({
        success: false,
        message: 'Visit is already confirmed'
      });
    }
    
    if (visit.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Cannot confirm a cancelled visit'
      });
    }
    
    // Check if visit date is in the past
    if (new Date(visit.visitDate) < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot confirm a visit scheduled in the past'
      });
    }
    
    // Update visit status
    visit.status = 'confirmed';
    visit.confirmedAt = new Date();
    visit.confirmationNotes = confirmationNotes || '';
    visit.meetingPoint = meetingPoint || '';
    await visit.save();
    
    // Get property info for notification
    const property = await Property.findById(visit.propertyId);
    
    // Send notification to user
    try {
      if (property) {
        await visitNotificationService.notifyVisitConfirmed(visit, property);
      }
    } catch (notifError) {
      console.error('Failed to send confirmation notification:', notifError);
      // Non-blocking error - we continue even if notification fails
    }
    
    // Return success response with formatted data
    return res.status(200).json({
      success: true,
      message: 'Visit confirmed successfully',
      visit: {
        ...visit.toObject(),
        visitDateFormatted: new Date(visit.visitDate).toLocaleString(),
        confirmedAtFormatted: new Date(visit.confirmedAt).toLocaleString()
      }
    });
  } catch (error) {
    console.error('Error confirming visit:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Cancel a visit (user or landlord)
 */
const cancelVisit = async (req, res) => {
  try {
    const { visitId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;
    
    if (!visitId) {
      return res.status(400).json({
        success: false,
        message: 'Visit ID is required'
      });
    }
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }
    
    // Check if visit exists and belongs to this user
    // For landlords, we'll handle this differently by checking landlordId
    let visit;
    
    // First retrieve the visit record regardless of user role
    visit = await Visit.findById(visitId);
    
    if (visit) {
      console.log('Found visit with ID:', visitId);
      console.log('Visit landlordId:', visit.landlordId);
      console.log('Visit userId:', visit.userId);
      console.log('Current user ID:', userId);
      console.log('User role:', userRole);
      
      // For debugging, output the token details
      console.log('JWT token user info:', req.user);
      
      // Determine if the user is authorized to cancel this visit
      const userIdStr = userId.toString();
      const visitUserId = visit.userId.toString();
      const visitLandlordId = visit.landlordId.toString();
      
      // For landlord, we also need to check other possible ID formats or related IDs
      // DEBUG - Temporarily allow any landlord user to cancel any visit
      let isAuthorized = false;
      
      if (userRole === 'admin') {
        console.log('Admin can cancel any visit');
        isAuthorized = true;
      } else if (userRole === 'landlord') {
        // Allow any landlord to cancel visits during testing
        console.log('Landlord role detected - allowing access');
        isAuthorized = true;
      } else if (visitUserId === userIdStr) {
        console.log('User owns this visit');
        isAuthorized = true;
      }
      
      if (!isAuthorized) {
        console.log('Not authorized to cancel this visit');
        visit = null; // Set to null so we return the not found error
      }
    } else {
      console.log('Visit not found with ID:', visitId);
    }
    
    if (!visit) {
      return res.status(404).json({
        success: false,
        message: 'Visit not found or not authorized'
      });
    }
    
    // Check if visit is already cancelled or completed
    if (['cancelled', 'completed'].includes(visit.status)) {
      return res.status(400).json({
        success: false,
        message: `Visit is already ${visit.status}`
      });
    }
    
    // Store the previous status for response
    const previousStatus = visit.status;
    
    // Add cancellation reason and who cancelled
    const { reason } = req.body;
    
    // Update visit status with cancellation details
    visit.status = 'cancelled';
    visit.cancelledAt = new Date();
    visit.cancelledBy = userId;
    visit.cancellationReason = reason || 'No reason provided';
    
    await visit.save();
    
    // Get property info for notification
    const property = await Property.findById(visit.propertyId);
    
    // Send notification to the other party
    try {
      if (property) {
        await visitNotificationService.notifyVisitCancelled(visit, property, userId);
      }
    } catch (notifError) {
      console.error('Failed to send cancellation notification:', notifError);
      // Non-blocking error - we continue even if notification fails
    }
    
    // Return success response with formatted data
    return res.status(200).json({
      success: true,
      message: 'Visit cancelled successfully',
      previousStatus,
      visit: {
        ...visit.toObject(),
        visitDateFormatted: new Date(visit.visitDate).toLocaleString(),
        cancelledAtFormatted: new Date(visit.cancelledAt).toLocaleString()
      }
    });
  } catch (error) {
    console.error('Error cancelling visit:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Get a specific visit by ID
 */
const getVisitById = async (req, res) => {
  try {
    const { visitId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;
    
    if (!visitId) {
      return res.status(400).json({
        success: false,
        message: 'Visit ID is required'
      });
    }
    
    // Find the visit
    const visit = await Visit.findById(visitId)
      .populate({
        path: 'propertyId',
        select: 'name address photos propertyType rent deposit'
      })
      .populate({
        path: 'landlordId',
        select: 'name mobile email'
      })
      .populate([
        // Try all possible user models for population
        {
          path: 'userId',
          select: 'name mobile email profilePicture',
          model: 'User'
        },
        {
          path: 'userId',
          select: 'name mobile email profilePicture',
          model: 'Tenant' 
        },
        {
          path: 'userId',
          select: 'name mobile email profilePicture',
          model: 'Landlord'
        }
      ])
      .lean();
      
    // If the visit exists but userId is not populated, try to find user with helper function
    if (visit && (!visit.userId || typeof visit.userId === 'string' || visit.userId instanceof mongoose.Types.ObjectId)) {
      const userDetails = await findUserById(visit.userId);
      if (userDetails) {
        visit.userId = {
          _id: userDetails._id,
          name: userDetails.name || 'Unknown',
          mobile: userDetails.mobile || 'N/A',
          email: userDetails.email || 'N/A'
        };
      }
    }
    
    if (!visit) {
      return res.status(404).json({
        success: false,
        message: 'Visit not found'
      });
    }
    
    // Verify authorization
    // Allow if user is the visitor, the landlord, or an admin
    // Handle potential nulls and ensure proper string comparison
    const userIdStr = userId.toString();
    
    // Handle both populated and non-populated user references safely
    let visitUserId = '';
    if (visit.userId) {
      if (typeof visit.userId === 'object' && visit.userId !== null) {
        visitUserId = visit.userId._id ? visit.userId._id.toString() : '';
      } else {
        visitUserId = visit.userId.toString();
      }
    }
    
    // Handle both populated and non-populated landlord references safely
    let visitLandlordId = '';
    if (visit.landlordId) {
      if (typeof visit.landlordId === 'object' && visit.landlordId !== null) {
        visitLandlordId = visit.landlordId._id ? visit.landlordId._id.toString() : '';
      } else {
        visitLandlordId = visit.landlordId.toString();
      }
    }
    
    console.log('Visit User ID:', visitUserId);
    console.log('Visit Landlord ID:', visitLandlordId);
    console.log('Current User ID:', userIdStr);
    
    // For testing, allow any landlord to access any visit
    let isAuthorized = false;
    
    if (userRole === 'admin' || userRole === 'landlord') {
      isAuthorized = true;
      console.log('Admin or landlord role detected - allowing access');
    } else if (visitUserId && visitUserId === userIdStr) {
      isAuthorized = true;
      console.log('User owns this visit - allowing access');
    } else if (visitLandlordId && visitLandlordId === userIdStr) {
      isAuthorized = true;
      console.log('Landlord owns this visit - allowing access');
    }
    
    console.log('Is authorized:', isAuthorized);
    
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this visit'
      });
    }
    
    // Format dates for display
    const visitDate = new Date(visit.visitDate);
    const formattedVisit = {
      ...visit,
      visitDateFormatted: `${visitDate.toDateString()} at ${visitDate.toLocaleTimeString()}`,
      confirmedAtFormatted: visit.confirmedAt ? new Date(visit.confirmedAt).toLocaleString() : null,
      cancelledAtFormatted: visit.cancelledAt ? new Date(visit.cancelledAt).toLocaleString() : null,
      completedAtFormatted: visit.completedAt ? new Date(visit.completedAt).toLocaleString() : null
    };
    
    return res.status(200).json({
      success: true,
      message: 'Visit retrieved successfully',
      visit: formattedVisit
    });
  } catch (error) {
    console.error('Error retrieving visit:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Complete a visit (landlord only)
 */
const completeVisit = async (req, res) => {
  try {
    const { visitId } = req.params;
    const { completionNotes, feedback } = req.body;
    
    console.log('Complete Visit Request - Request params:', req.params);
    console.log('Complete Visit Request - User role:', req.user.role);
    console.log('Complete Visit Request - User ID:', req.user.id);
    console.log('Complete Visit Request - Landlord object:', req.landlord);
    
    if (!visitId) {
      return res.status(400).json({
        success: false,
        message: 'Visit ID is required'
      });
    }
    
    // Get landlordId from req.landlord if available, otherwise fall back to user ID
    let landlordId;
    
    if (req.landlord && (req.landlord._id || req.landlord.id)) {
      landlordId = req.landlord._id || req.landlord.id;
    } else if (req.user && req.user.role === 'landlord') {
      // Use the user ID as landlord ID if role is landlord
      landlordId = req.user.id;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Landlord ID is required'
      });
    }
    
    // First fetch the visit by ID
    const visit = await Visit.findById(visitId);
    
    if (!visit) {
      return res.status(404).json({
        success: false,
        message: 'Visit not found'
      });
    }
    
    // Now check if the landlord is authorized
    console.log('Visit landlordId:', visit.landlordId.toString());
    console.log('User landlordId:', landlordId.toString());
    
    // Convert both IDs to string for comparison
    const visitLandlordId = visit.landlordId.toString();
    const userLandlordId = landlordId.toString();
    
    // Allow admin or the correct landlord
    const isAuthorized = (req.user.role === 'admin') || (visitLandlordId === userLandlordId);
    
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to complete this visit'
      });
    }
    
    // Check if visit is already completed or cancelled
    if (visit.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Visit is already marked as completed'
      });
    }
    
    if (visit.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Cannot complete a cancelled visit'
      });
    }
    
    // Update visit status
    visit.status = 'completed';
    visit.completedAt = new Date();
    visit.completionNotes = completionNotes || '';
    
    // Handle feedback correctly according to the schema
    if (typeof feedback === 'string') {
      visit.feedback = {
        comment: feedback || '',
        givenAt: new Date()
      };
    } else if (typeof feedback === 'object' && feedback !== null) {
      visit.feedback = {
        rating: feedback.rating || undefined,
        comment: feedback.comment || '',
        givenAt: new Date()
      };
    } else {
      // If no feedback is provided, set it to an empty object to avoid validation errors
      visit.feedback = {
        comment: '',
        givenAt: new Date()
      };
    }
    
    console.log('Setting feedback to:', visit.feedback);
    
    await visit.save();
    
    // Get property info for notification
    const property = await Property.findById(visit.propertyId);
    
    // Send notification to user
    try {
      if (property) {
        await visitNotificationService.notifyVisitCompleted(visit, property);
      }
    } catch (notifError) {
      console.error('Failed to send completion notification:', notifError);
      // Non-blocking error - we continue even if notification fails
    }
    
    // Return success response with formatted data
    return res.status(200).json({
      success: true,
      message: 'Visit marked as completed successfully',
      visit: {
        ...visit.toObject(),
        visitDateFormatted: new Date(visit.visitDate).toLocaleString(),
        completedAtFormatted: new Date(visit.completedAt).toLocaleString()
      }
    });
  } catch (error) {
    console.error('Error completing visit:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

module.exports = {
  createVisit,
  getUserVisits,
  getLandlordVisits,
  getVisitById,
  confirmVisit,
  cancelVisit,
  completeVisit
};
