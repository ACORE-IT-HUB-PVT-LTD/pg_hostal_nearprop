const express = require('express');
const router = express.Router();
const otpAuthController = require('../controllers/otpAuthController');

// OTP authentication routes
router.post('/request-otp', otpAuthController.requestLoginOtp);
router.post('/verify-otp', otpAuthController.verifyLoginOtp);

module.exports = router;
