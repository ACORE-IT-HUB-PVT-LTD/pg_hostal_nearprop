const jwt = require('jsonwebtoken');
const Landlord = require('../models/Landlord');
const Tenant = require('../models/Tenant');
const { redisClient } = require('../config/database');
const otpService = require('../services/otpService');
const { sequelize } = require('../config/pg');
const { QueryTypes } = require('sequelize');

require('dotenv').config();

/**
 * Request OTP for login
 */
const requestLoginOtp = async(req, res) => {
  try {
    const { mobile, userType } = req.body;

    if (!mobile) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number is required'
      });
    }

    // Check if user exists based on user type
    let user;
    let isRegistered = false;
    if (userType === 'tenant') {
      user = await Tenant.findOne({ mobile });
    } else {
      // Default to landlord
      user = await Landlord.findOne({ mobile });
    }

    // Set registration status
    isRegistered = !!user;

    // Generate OTP even if user is not registered
    const otp = otpService.generateOtp();

    // Save OTP to database
    const savedOtp = await otpService.saveOtp(mobile, otp, 'login');

    if (!savedOtp) {
      return res.status(500).json({
        success: false,
        message: 'Failed to generate OTP',
        isRegistered
      });
    }

    // Send OTP via SMS
    const smsSent = await otpService.sendOtp(mobile, otp);

    // Always log the OTP for debugging (in production, you might want to remove this)
    console.log(`Generated OTP for ${mobile}: ${otp}`);

    return res.status(200).json({
      success: true,
      message: smsSent
        ? 'OTP sent successfully'
        : 'OTP generated but SMS service failed. Check server logs for OTP',
      mobile,
      otp,
      isRegistered,
      userName: user ? user.name : null
    });
  } catch (error) {
    console.error('Error in requestLoginOtp:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Verify OTP and login
 */
const verifyLoginOtp = async (req, res) => {
  try {
    const { mobile, otp, userType } = req.body;

    if (!mobile || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Mobile and OTP are required'
      });
    }

    const userPg = await sequelize.query(
      `
  SELECT id, name
  FROM users
  WHERE mobile_number = :mobile
  LIMIT 1
  `,
      {
        replacements: { mobile },
        type: QueryTypes.SELECT
      }
    );

    const users = userPg[0];

    // Verify OTP and get OTP record
    const otpRecord = await otpService.verifyOtp(mobile, otp);

    if (!otpRecord) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired OTP'
      });
    }

    // Find user based on user type
    let user;
    let role;
    let isRegistered = false;

    if (userType === 'tenant') {
      user = await Tenant.findOne({ mobile });
      role = 'tenant';
    } else {
      // Default to landlord
      user = await Landlord.findOne({ mobile });
      role = 'landlord';
    }

    // Set registration status
    isRegistered = !!user;

    // Always show OTP in response for testing
    const otpValue = otpRecord.otp;

    if (!user) {
      // OTP verified but user not registered
      return res.status(200).json({
        success: true,
        message: 'OTP verified successfully but user is not registered',
        isRegistered: false,
        otpVerified: true,
        mobile,
        otp: otpValue
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        sub: user._id.toString(),
        Id: users.id,
        roles: user.role,
        sessionId: uuidv4(),
        iss: 'NearpropBackend',
      },
      process.env.JWT_SECRET,
      { expiresIn: '10y' }
    );

    // Store token in Redis
    const redisKey = `${role}:${user._id}`;
    await redisClient.setEx(redisKey, 3600 * 24, JSON.stringify({ token }));

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      isRegistered: true,
      otp: otpValue,
      user: {
        id: user._id,
        name: user.name,
        mobile: user.mobile,
        email: user.email,
        role
      }
    });
  } catch (error) {
    console.error('Error in verifyLoginOtp:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

module.exports = {
  requestLoginOtp,
  verifyLoginOtp
};

