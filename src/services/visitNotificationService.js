/**
 * Visit Notification Service - Handles notifications for visit scheduling
 */
const { redisClient } = require('../config/database');
const socketService = require('./socketService');

/**
 * Send notification when a new visit is scheduled
 * @param {Object} visit - The visit object
 * @param {Object} property - The property object
 * @param {Object} user - The user who scheduled the visit
 */
const notifyVisitScheduled = async (visit, property, user) => {
  try {
    // Safety check for required parameters
    if (!visit || !property || !user) {
      console.error('Missing required parameters for visit notification');
      return false;
    }
    
    // Ensure we have a landlord ID to send to
    if (!visit.landlordId) {
      console.error('No landlord ID found for visit notification');
      return false;
    }

    // Format the visit date nicely
    const visitDate = new Date(visit.visitDate);
    const formattedDate = visitDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    // Create notification for landlord
    const notification = {
      type: 'visit_scheduled',
      message: `New visit scheduled for ${property.name} on ${formattedDate}`,
      userId: visit.landlordId,
      data: {
        visitId: visit._id,
        propertyId: property._id,
        propertyName: property.name || 'Your property',
        visitorName: user.name || 'A user',
        visitorMobile: user.mobile || 'Not provided',
        visitorEmail: user.email || 'Not provided',
        visitDate: visit.visitDate,
        formattedDate,
        status: visit.status,
        notes: visit.notes || 'No additional notes'
      },
      createdAt: new Date()
    };
    
    // Store notification in Redis if available
    try {
      // Make this robust - handle if Redis is not available
      if (redisClient && redisClient.isReady) {
        const notificationKey = `notification:${visit.landlordId}:${visit._id}`;
        await redisClient.set(notificationKey, JSON.stringify(notification), 'EX', 60 * 60 * 24 * 7); // 7 days
        
        // Add to landlord's notification list
        await redisClient.sAdd(`notifications:${visit.landlordId}`, notificationKey);
      } else {
        console.log('Redis client not available for storing notification');
      }
    } catch (redisError) {
      console.error('Redis error storing notification:', redisError);
      // Continue execution even if Redis fails
    }
    
    // Send real-time notification via Socket.IO if available
    try {
      if (socketService && typeof socketService.sendNotification === 'function') {
        socketService.sendNotification(visit.landlordId, notification);
      } else {
        console.log('Socket service not available for real-time notification');
      }
    } catch (socketError) {
      console.error('Socket error sending notification:', socketError);
      // Continue execution even if Socket.IO fails
    }
    
    return true;
  } catch (error) {
    console.error('Error sending visit notification:', error);
    return false;
  }
};

/**
 * Send notification when a visit is confirmed
 * @param {Object} visit - The visit object
 * @param {Object} property - The property object
 */
const notifyVisitConfirmed = async (visit, property) => {
  try {
    // Safety check for required parameters
    if (!visit || !property) {
      console.error('Missing required parameters for confirmation notification');
      return false;
    }
    
    // Ensure we have a user ID to send to
    if (!visit.userId) {
      console.error('No user ID found for confirmation notification');
      return false;
    }
    
    // Format the visit date nicely
    const visitDate = new Date(visit.visitDate);
    const formattedDate = visitDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    // Create notification for user
    const notification = {
      type: 'visit_confirmed',
      message: `Your visit to ${property.name} on ${formattedDate} has been confirmed`,
      userId: visit.userId,
      data: {
        visitId: visit._id,
        propertyId: property._id,
        propertyName: property.name || 'The property',
        visitDate: visit.visitDate,
        formattedDate,
        confirmedAt: visit.confirmedAt,
        status: visit.status,
        address: property.address || 'Address not provided',
        landlordId: visit.landlordId
      },
      createdAt: new Date()
    };
    
    // Store notification in Redis if available
    try {
      // Make this robust - handle if Redis is not available
      if (redisClient && redisClient.isReady) {
        const notificationKey = `notification:${visit.userId}:${visit._id}:confirmed`;
        await redisClient.set(notificationKey, JSON.stringify(notification), 'EX', 60 * 60 * 24 * 7); // 7 days
        
        // Add to user's notification list
        await redisClient.sAdd(`notifications:${visit.userId}`, notificationKey);
      } else {
        console.log('Redis client not available for storing confirmation notification');
      }
    } catch (redisError) {
      console.error('Redis error storing confirmation notification:', redisError);
      // Continue execution even if Redis fails
    }
    
    // Send real-time notification via Socket.IO if available
    try {
      if (socketService && typeof socketService.sendNotification === 'function') {
        socketService.sendNotification(visit.userId, notification);
      } else {
        console.log('Socket service not available for real-time confirmation notification');
      }
    } catch (socketError) {
      console.error('Socket error sending confirmation notification:', socketError);
      // Continue execution even if Socket.IO fails
    }
    
    return true;
  } catch (error) {
    console.error('Error sending visit confirmation notification:', error);
    return false;
  }
};

/**
 * Send notification when a visit is cancelled
 * @param {Object} visit - The visit object
 * @param {Object} property - The property object
 * @param {String} cancelledBy - User ID of who cancelled the visit
 */
const notifyVisitCancelled = async (visit, property, cancelledBy) => {
  try {
    // Safety check for required parameters
    if (!visit || !property) {
      console.error('Missing required parameters for cancellation notification');
      return false;
    }
    
    if (!visit.userId || !visit.landlordId) {
      console.error('Missing user or landlord ID for cancellation notification');
      return false;
    }
    
    // Determine who to notify (the other party)
    const isCancelledByUser = cancelledBy && (cancelledBy === visit.userId.toString());
    const recipientId = isCancelledByUser ? visit.landlordId : visit.userId;
    const recipientRole = isCancelledByUser ? 'landlord' : 'user';
    
    // Format the visit date nicely
    const visitDate = new Date(visit.visitDate);
    const formattedDate = visitDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    // Create cancellation message depending on who cancelled
    const message = isCancelledByUser 
      ? `User cancelled visit to ${property.name} on ${formattedDate}`
      : `Landlord cancelled your visit to ${property.name} on ${formattedDate}`;
    
    // Create notification
    const notification = {
      type: 'visit_cancelled',
      message,
      userId: recipientId,
      data: {
        visitId: visit._id,
        propertyId: property._id,
        propertyName: property.name || 'The property',
        visitDate: visit.visitDate,
        formattedDate,
        status: visit.status,
        cancelledAt: visit.cancelledAt || new Date(),
        cancelledBy,
        cancellationReason: visit.cancellationReason || 'No reason provided',
        recipientRole
      },
      createdAt: new Date()
    };
    
    // Store notification in Redis if available
    try {
      // Make this robust - handle if Redis is not available
      if (redisClient && redisClient.isReady) {
        const notificationKey = `notification:${recipientId}:${visit._id}:cancelled`;
        await redisClient.set(notificationKey, JSON.stringify(notification), 'EX', 60 * 60 * 24 * 7); // 7 days
        
        // Add to recipient's notification list
        await redisClient.sAdd(`notifications:${recipientId}`, notificationKey);
      } else {
        console.log('Redis client not available for storing cancellation notification');
      }
    } catch (redisError) {
      console.error('Redis error storing cancellation notification:', redisError);
      // Continue execution even if Redis fails
    }
    
    // Send real-time notification via Socket.IO if available
    try {
      if (socketService && typeof socketService.sendNotification === 'function') {
        socketService.sendNotification(recipientId, notification);
      } else {
        console.log('Socket service not available for real-time cancellation notification');
      }
    } catch (socketError) {
      console.error('Socket error sending cancellation notification:', socketError);
      // Continue execution even if Socket.IO fails
    }
    
    return true;
  } catch (error) {
    console.error('Error sending visit cancellation notification:', error);
    return false;
  }
};

/**
 * Send reminder notification for upcoming visits
 * @param {Object} visit - The visit object
 * @param {Object} property - The property object
 * @param {String} recipientType - 'user' or 'landlord'
 */
const notifyVisitReminder = async (visit, property, recipientType) => {
  try {
    // Safety check for required parameters
    if (!visit || !property) {
      console.error('Missing required parameters for reminder notification');
      return false;
    }
    
    const recipientId = recipientType === 'user' ? visit.userId : visit.landlordId;
    
    if (!recipientId) {
      console.error(`Missing ${recipientType} ID for reminder notification`);
      return false;
    }
    
    // Format the visit date nicely
    const visitDate = new Date(visit.visitDate);
    const formattedDate = visitDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    // Calculate time until visit (in hours)
    const hoursUntilVisit = Math.round((visitDate - new Date()) / (1000 * 60 * 60));
    
    // Create reminder message depending on recipient type
    const message = recipientType === 'user' 
      ? `Reminder: Your visit to ${property.name} is scheduled for ${formattedDate} (in ${hoursUntilVisit} hours)`
      : `Reminder: A visit for property ${property.name} is scheduled for ${formattedDate} (in ${hoursUntilVisit} hours)`;
    
    // Create notification
    const notification = {
      type: 'visit_reminder',
      message,
      userId: recipientId,
      data: {
        visitId: visit._id,
        propertyId: property._id,
        propertyName: property.name || 'The property',
        visitDate: visit.visitDate,
        formattedDate,
        status: visit.status,
        hoursUntilVisit,
        recipientType,
        address: property.address || 'Address not provided'
      },
      createdAt: new Date()
    };
    
    // Store notification in Redis if available
    try {
      if (redisClient && redisClient.isReady) {
        const notificationKey = `notification:${recipientId}:${visit._id}:reminder:${hoursUntilVisit}h`;
        await redisClient.set(notificationKey, JSON.stringify(notification), 'EX', 60 * 60 * 24); // 24 hours expiration for reminders
        
        // Add to recipient's notification list
        await redisClient.sAdd(`notifications:${recipientId}`, notificationKey);
      } else {
        console.log('Redis client not available for storing reminder notification');
      }
    } catch (redisError) {
      console.error('Redis error storing reminder notification:', redisError);
      // Continue execution even if Redis fails
    }
    
    // Send real-time notification via Socket.IO if available
    try {
      if (socketService && typeof socketService.sendNotification === 'function') {
        socketService.sendNotification(recipientId, notification);
      } else {
        console.log('Socket service not available for real-time reminder notification');
      }
    } catch (socketError) {
      console.error('Socket error sending reminder notification:', socketError);
      // Continue execution even if Socket.IO fails
    }
    
    return true;
  } catch (error) {
    console.error('Error sending visit reminder notification:', error);
    return false;
  }
};

module.exports = {
  notifyVisitScheduled,
  notifyVisitConfirmed,
  notifyVisitCancelled,
  notifyVisitReminder
};
