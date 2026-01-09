const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const ChatMessage = require('../models/ChatMessage');

// Get chat history by room
router.get('/history/:roomId', async (req, res) => {
  try {
    const messages = await ChatMessage
      .find({ roomId: req.params.roomId })
      .sort({ createdAt: 1 })
      .limit(50);

    res.json({ success: true, messages });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
