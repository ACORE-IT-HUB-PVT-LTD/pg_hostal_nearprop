const socketIO = require('socket.io');
const { ReelNotification } = require('../models/Reel');
const { redisClient } = require('../config/database');

let io;

/**
 * Initialize Socket.IO server
 * @param {Object} server - HTTP server instance
 */
const initializeSocketIO = (server) => {
  io = socketIO(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });
  
  io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    
    // Handle client authentication
    socket.on('authenticate', async (data) => {
      if (data && data.userId && data.token) {
        try {
          // Validate token from Redis (optional, you can use JWT validation too)
          const redisKey = `${data.role || 'landlord'}:${data.userId}`;
          
          // Check if Redis is available first
          if (!redisClient || !redisClient.isReady) {
            console.log('Redis not available, accepting socket connection without validation');
            socket.userId = data.userId;
            socket.role = data.role || 'landlord';
            socket.join(`user:${data.userId}`);
            socket.emit('authenticated', { success: true });
            return;
          }
          
          const storedToken = await redisClient.get(redisKey);
          
          if (storedToken) {
            const tokenData = JSON.parse(storedToken);
            if (tokenData.token === data.token) {
              // Store user ID in socket for later use
              socket.userId = data.userId;
              socket.role = data.role || 'landlord';
              
              // Join user to their personal room
              socket.join(`user:${data.userId}`);
              
              socket.emit('authenticated', { success: true });
              console.log(`User ${data.userId} authenticated`);
              
              // Send any unread notifications
              if (data.role === 'landlord') {
                const unreadNotifications = await ReelNotification.find({
                  landlordId: data.userId,
                  isRead: false
                })
                .sort({ createdAt: -1 })
                .limit(10)
                .populate('userId', 'name profilePhoto')
                .populate('reelId', 'title');
                
                if (unreadNotifications.length > 0) {
                  socket.emit('unread_notifications', { notifications: unreadNotifications });
                }
              }
            } else {
              socket.emit('authenticated', { success: false, error: 'Invalid token' });
            }
          } else {
            socket.emit('authenticated', { success: false, error: 'Session not found' });
          }
        } catch (error) {
          console.error('Authentication error:', error);
          socket.emit('authenticated', { success: false, error: 'Authentication error' });
        }
      } else {
        socket.emit('authenticated', { success: false, error: 'Missing authentication data' });
      }
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });
  
  return io;
};

/**
 * Send notification to a specific user
 * @param {String} userId - User ID to send notification to
 * @param {Object} notification - Notification data
 */
const sendNotification = (userId, notification) => {
  if (io) {
    io.to(`user:${userId}`).emit('notification', notification);
  }
};

/**
 * Send real-time notification for reel interaction
 * @param {Object} notification - ReelNotification document
 */
const sendReelNotification = async (notification) => {
  try {
    // Populate notification with user and reel details
    const populatedNotification = await ReelNotification.findById(notification._id)
      .populate('userId', 'name profilePhoto')
      .populate('reelId', 'title');
    
    if (populatedNotification) {
      sendNotification(populatedNotification.landlordId.toString(), {
        type: 'reel_interaction',
        notification: populatedNotification
      });
    }
  } catch (error) {
    console.error('Error sending real-time notification:', error);
  }
};

module.exports = {
  initializeSocketIO,
  sendReelNotification
};
