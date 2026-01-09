const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');

const ChatMessage = require('../models/ChatMessage');
const Property = require('../models/Property');

let io;

// 🔑 SAME room for same 2 users + property
const getRoomId = (propertyId, userId1, userId2) => {
  const ids = [userId1.toString(), userId2.toString()].sort();
  return `chat:${propertyId}:${ids[0]}:${ids[1]}`;
};

const initializeSocketIO = (server) => {
  io = socketIO(server, {
    cors: { origin: '*' }
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    /* ================= AUTH ================= */
    socket.on('authenticate', ({ token }) => {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        socket.userId = decoded.userId;
        socket.role = decoded.role === 'landlord' ? 'VENDOR' : 'USER';

        // personal room (for notification)
        socket.join(`user:${socket.userId}`);

        socket.emit('authenticated', {
          success: true,
          userId: socket.userId,
          role: socket.role
        });

        console.log(`Authenticated ${socket.userId} as ${socket.role}`);

      } catch (err) {
        socket.emit('authenticated', {
          success: false,
          error: 'Invalid token'
        });
      }
    });

    /* ================= JOIN CHAT ================= */
    socket.on('chat:join', async ({ propertyId, otherUserId }) => {
      if (!socket.userId) return;

      const property = await Property.findById(propertyId);
      if (!property) return;

      // 🔐 Vendor cannot fake userId
      let targetUserId = otherUserId;

      if (socket.role === 'VENDOR') {
        targetUserId = property.landlordId.toString();
      }

      const roomId = getRoomId(propertyId, socket.userId, targetUserId);
      socket.join(roomId);

      socket.emit('chat:joined', { roomId });
      console.log(`${socket.userId} joined ${roomId}`);
    });

    /* ================= SEND MESSAGE ================= */
    socket.on('chat:message', async ({ propertyId, message }) => {
      if (!socket.userId || !message) return;

      const property = await Property.findById(propertyId);
      if (!property) return;

      const vendorId = property.landlordId.toString();
      const receiverId =
        socket.role === 'USER' ? vendorId : property.createdByUserId.toString();

      const roomId = getRoomId(propertyId, socket.userId, receiverId);

      // save
      const saved = await ChatMessage.create({
        roomId,
        propertyId,
        senderId: socket.userId,
        receiverId,
        senderRole: socket.role,
        message
      });

      // send to room
      io.to(roomId).emit('chat:receive', saved);

      // 🔔 notify receiver (even if offline)
      io.to(`user:${receiverId}`).emit('chat:invite', {
        roomId,
        propertyId,
        from: socket.userId,
        message
      });
    });

    socket.on('disconnect', () => {
      console.log('Disconnected:', socket.id);
    });
  });

  return io;
};

module.exports = { initializeSocketIO };
