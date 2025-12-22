const axios = require('axios');
const Otp = require('../models/Otp');
const crypto = require('crypto');

/**
 * Generate a random 6-digit OTP
 */
const generateOtp = () => {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  // Log generated OTP with timestamp for easy debugging
  console.log(`[${new Date().toISOString()}] GENERATED OTP: ${otp}`);
  return otp;
};

/**
 * Save OTP to database
 */
const saveOtp = async (mobile, otp, purpose = 'login') => {
  try {
    // Delete any existing OTPs for this mobile number
    await Otp.deleteMany({ mobile });
    
    // Create new OTP record
    const otpRecord = new Otp({
      mobile,
      otp,
      purpose
    });
    
    await otpRecord.save();
    console.log(`[${new Date().toISOString()}] OTP saved for mobile ${mobile}: ${otp} (purpose: ${purpose})`);
    return true;
  } catch (error) {
    console.error('Error saving OTP:', error);
    return false;
  }
};

/**
 * Send OTP via SMS using the digital SMS API
 */
const sendOtp = async (mobile, otp) => {
  try {
    console.log(`Sending OTP: ${otp} to mobile: ${mobile}`);
    
    // Check if mobile number is valid and add country code if needed
    let recipient = mobile;
    if (!recipient.startsWith('91') && recipient.length === 10) {
      recipient = `91${recipient}`;
    }
    
    const response = await axios.post(
      'https://sms.digitalsms.net/api/v3/sendsms',
      {
        recipient,
        sender_id: "RWTLTD",
        entity_id: "1701175100042384521",
        type: "transactional",
        dlt_template_id: "1707175170423044409",
        message: `Your Rudraashwi verification code is: ${otp}. Do not share this code with anyone. It is valid for 10 minutes.`
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer 258|uEXsqSmGr4BfCR1NyUTmYx0hAhmkBTw6MeRbdqcr1f13f0a9'
        }
      }
    );
    
    console.log('SMS API Response:', response.data);
    return true;
  } catch (error) {
    console.error('Error sending OTP SMS:', error.response?.data || error.message);
    return false;
  }
};

/**
 * Verify OTP
 */

const verifyOtp = async (mobile, otp) => {
  try {
    // Find the OTP record
    const otpRecord = await Otp.findOne({
      mobile,
      otp,
      isVerified: false,
      createdAt: { $gt: new Date(Date.now() - 10 * 60 * 1000) } // OTP not older than 10 minutes
    });

    if (!otpRecord) {
      return null;
    }

    // Mark OTP as verified
    otpRecord.isVerified = true;
    await otpRecord.save();

    // Schedule deletion after 15 minutes
    setTimeout(async () => {
      try {
        await Otp.deleteOne({ _id: otpRecord._id });
        console.log(`OTP for ${mobile} deleted 15 min after verification.`);
      } catch (err) {
        console.error('Error deleting OTP after verification:', err);
      }
    }, 15 * 60 * 1000);

    return otpRecord;
  } catch (error) {
    console.error('Error verifying OTP:', error);
    return null;
  }
};

/**
 * Cleanup expired OTPs (runs every 30 minutes)
 */
const setupOtpCleanup = () => {
  // Schedule cleanup every 30 minutes
  setInterval(async () => {
    try {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      const result = await Otp.deleteMany({
        createdAt: { $lt: thirtyMinutesAgo }
      });
      
      console.log(`Cleaned up ${result.deletedCount} expired OTPs`);
    } catch (error) {
      console.error('Error cleaning up OTPs:', error);
    }
  }, 30 * 60 * 1000);
};

module.exports = {
  generateOtp,
  saveOtp,
  sendOtp,
  verifyOtp,
  setupOtpCleanup
};
