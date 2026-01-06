const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const ChatMessage = require('../models/ChatMessage');
const { ReelNotification } = require('../models/Reel');
const Property = require('../models/Property'); // 👈 REQUIRED
const { redisClient } = require('../config/database');

let io;

/**
 * 🔑 Utility: Generate deterministic roomId
 * room = property + user + vendor
 */
const getRoomId = (propertyId, userId, vendorId) => {
  const ids = [userId.toString(), vendorId.toString()].sort();
  return `chat:${propertyId}:${ids[0]}:${ids[1]}`;
};

/**
 * Initialize Socket.IO
 */
const initializeSocketIO = (server) => {
  io = socketIO(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id);

    const ALLOWED_CHAT_ROLES = [
      'ADVISOR',
      'USER',
      'FRANCHISEE',
      'DEVELOPER',
      'SELLER',
      'landlord'
    ];

    /**
     * =====================
     * 🔐 AUTHENTICATION
     * =====================
     */
    socket.on('authenticate', async ({ token }) => {
      try {
        if (!token) {
          return socket.emit('authenticated', {
            success: false,
            error: 'Token missing'
          });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        /**
         * decoded example:
         * {
         *   userId: "123",
         *   roles: ["USER"]
         * }
         */

        // const userRoles = decoded.roles || [];
        const userRoles = ["USER","landlord"];

        const allowed = userRoles.some(r =>
          ALLOWED_CHAT_ROLES.includes(r)
        );

        if (!allowed) {
          return socket.emit('authenticated', {
            success: false,
            error: 'Chat access denied'
          });
        }

        // Save on socket
        socket.userId = decoded.userId;
        socket.roles = userRoles;
        socket.role = userRoles[0];

        // Personal room (for notifications)
        socket.join(`user:${socket.userId}`);

        socket.emit('authenticated', {
          success: true,
          userId: socket.userId,
          role: socket.role
        });

        console.log(
          `✅ Authenticated ${socket.userId} as ${socket.role}`
        );

      } catch (err) {
        console.error('❌ Socket auth error:', err.message);
        socket.emit('authenticated', {
          success: false,
          error: 'Invalid or expired token'
        });
      }
    });

    /**
     * =====================
     * 🏠 JOIN CHAT (PROPERTY BASED)
     * =====================
     */
    socket.on('chat:join', async ({ propertyId }) => {
      if (!socket.userId) {
        return socket.emit('chat:error', 'User not authenticated');
      }

      if (!propertyId) {
        return socket.emit('chat:error', 'propertyId missing');
      }

      try {
        const property = await Property.findById(propertyId);
        console.log(property);

        if (!property) {
          return socket.emit('chat:error', 'Property not found');
        }

        const vendorId = property.landlordId.toString();

        const roomId = getRoomId(
          propertyId,
          socket.userId,
          vendorId
        );

        socket.join(roomId);

        socket.emit('chat:joined', {
          roomId,
          propertyId,
          vendorId
        });

        // Notify vendor if online
        io.to(`user:${vendorId}`).emit('chat:invite', {
          roomId,
          propertyId,
          userId: socket.userId
        });

        console.log(
          `💬 ${socket.userId} joined room ${roomId}`
        );

      } catch (err) {
        console.error('❌ chat:join error:', err);
        socket.emit('chat:error', 'Failed to join chat');
      }
    });

    /**
     * =====================
     * 💬 SEND MESSAGE
     * =====================
     */
    socket.on('chat:message', async ({ roomId, propertyId, message }) => {
      if (!socket.userId) return;
      if (!roomId || !message) return;

      try {
        const savedMessage = await ChatMessage.create({
          roomId,
          propertyId,
          senderId: socket.userId,
          senderRole: socket.role,
          message
        });

        io.to(roomId).emit('chat:receive', {
          _id: savedMessage._id,
          roomId: savedMessage.roomId,
          propertyId: savedMessage.propertyId,
          senderId: savedMessage.senderId,
          senderRole: savedMessage.senderRole,
          message: savedMessage.message,
          createdAt: savedMessage.createdAt
        });

      } catch (err) {
        console.error('❌ Message save error:', err);
      }
    });

    /**
     * =====================
     * 🔌 DISCONNECT
     * =====================
     */
    socket.on('disconnect', () => {
      console.log('❎ Client disconnected:', socket.id);
    });
  });

  return io;
};

/**
 * =====================
 * 🔔 NOTIFICATIONS
 * =====================
 */
const sendNotification = (userId, notification) => {
  if (io) {
    io.to(`user:${userId}`).emit('notification', notification);
  }
};

const sendReelNotification = async (notification) => {
  try {
    const populated = await ReelNotification.findById(notification._id)
      .populate('userId', 'name profilePhoto')
      .populate('reelId', 'title');

    if (populated) {
      sendNotification(
        populated.landlordId.toString(),
        {
          type: 'reel_interaction',
          notification: populated
        }
      );
    }
  } catch (error) {
    console.error('❌ Reel notification error:', error);
  }
};

module.exports = {
  initializeSocketIO,
  sendReelNotification
};
