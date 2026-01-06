const socketIO = require('socket.io');
const { ReelNotification } = require('../models/Reel');
const { redisClient } = require('../config/database');
const ChatMessage = require('../models/ChatMessage');
const jwt = require("jsonwebtoken");


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
    // socket.on('authenticate', async (data) => {
    //   if (data && data.userId && data.token) {
    //     try {
    //       // Validate token from Redis (optional, you can use JWT validation too)
    //       const redisKey = `${data.role || 'landlord'}:${data.userId}`;

    //       // Check if Redis is available first
    //       if (!redisClient || !redisClient.isReady) {
    //         console.log('Redis not available, accepting socket connection without validation');
    //         socket.userId = data.userId;
    //         socket.role = data.role || 'landlord';
    //         socket.join(`user:${data.userId}`);
    //         socket.emit('authenticated', { success: true });
    //         return;
    //       }

    //       const storedToken = await redisClient.get(redisKey);

    //       if (storedToken) {
    //         const tokenData = JSON.parse(storedToken);
    //         if (tokenData.token === data.token) {
    //           // Store user ID in socket for later use
    //           socket.userId = data.userId;
    //           socket.role = data.role || 'landlord';

    //           // Join user to their personal room
    //           socket.join(`user:${data.userId}`);

    //           socket.emit('authenticated', { success: true });
    //           console.log(`User ${data.userId} authenticated`);

    //           // Send any unread notifications
    //           if (data.role === 'landlord') {
    //             const unreadNotifications = await ReelNotification.find({
    //               landlordId: data.userId,
    //               isRead: false
    //             })
    //               .sort({ createdAt: -1 })
    //               .limit(10)
    //               .populate('userId', 'name profilePhoto')
    //               .populate('reelId', 'title');

    //             if (unreadNotifications.length > 0) {
    //               socket.emit('unread_notifications', { notifications: unreadNotifications });
    //             }
    //           }
    //         } else {
    //           socket.emit('authenticated', { success: false, error: 'Invalid token' });
    //         }
    //       } else {
    //         socket.emit('authenticated', { success: false, error: 'Session not found' });
    //       }
    //     } catch (error) {
    //       console.error('Authentication error:', error);
    //       socket.emit('authenticated', { success: false, error: 'Authentication error' });
    //     }
    //   } else {
    //     socket.emit('authenticated', { success: false, error: 'Missing authentication data' });
    //   }
    // });

    const ALLOWED_CHAT_ROLES = [
      'ADVISOR',
      'USER',
      'FRANCHISEE',
      'DEVELOPER',
      'SELLER',
      'landlord'
    ];

    socket.on('authenticate', async (data) => {
      try {
        if (!data?.token) {
          return socket.emit('authenticated', {
            success: false,
            error: 'Token missing'
          });
        }

        const decoded = jwt.verify(
          data.token,
          process.env.JWT_SECRET
        );

        console.log(decoded);

        /**
         * decoded = {
         *  userId: "4",
         *  roles: ["ADVISOR", "USER", ...]
         * }
         */

        const userRoles = ['ADVISOR',
          'USER',
          'FRANCHISEE',
          'DEVELOPER',
          'SELLER',
          'landlord'];

        // ✅ Check allowed roles
        const isAllowed = userRoles.some(role =>
          ALLOWED_CHAT_ROLES.includes(role)
        );

        if (!isAllowed) {
          return socket.emit('authenticated', {
            success: false,
            error: 'Chat access denied for your role'
          });
        }

        // ✅ Save data in socket
        socket.userId = decoded.userId;
        socket.roles = userRoles;
        socket.role = socket.roles.length > 0 ? socket.roles[0] : null;

        socket.join(`user:${decoded.userId}`);

        socket.emit('authenticated', {
          success: true,
          roles: userRoles
        });

        console.log(
          `✅ User ${decoded.userId} authenticated with roles`,
          userRoles
        );

      } catch (err) {
        console.error('Socket auth error:', err);
        socket.emit('authenticated', {
          success: false,
          error: 'Invalid or expired token'
        });
      }
    });


    // ===================== CHAT EVENTS =====================

    // Join chat room
    socket.on('chat:join', (data) => {
      if (!socket.userId) {
        socket.emit('chat:error', 'User not authenticated');
        return;
      }

      const roomId = data.roomId;
      socket.join(roomId);

      console.log(`💬 User ${socket.userId} joined room ${roomId}`);

      socket.to(roomId).emit('chat:userJoined', {
        userId: socket.userId,
        role: socket.role
      });
    });

    // Send chat message
    socket.on('chat:message', async (data) => {
      if (!socket.userId) return;

      try {
        const savedMessage = await ChatMessage.create({
          roomId: data.roomId,
          senderId: socket.userId,
          senderRole: socket.role,
          message: data.message
        });

        io.to(data.roomId).emit('chat:receive', {
          _id: savedMessage._id,
          roomId: savedMessage.roomId,
          senderId: savedMessage.senderId,
          senderRole: savedMessage.senderRole,
          message: savedMessage.message,
          createdAt: savedMessage.createdAt
        });
      } catch (err) {
        console.error('Chat message save error:', err);
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
