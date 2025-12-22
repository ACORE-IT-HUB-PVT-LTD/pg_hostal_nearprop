// SMS sending utility
const axios = require('axios');
const smsConfig = require('../config/sms');

const sendSMS = async (phone, message) => {
  try {
    const response = await axios.get(smsConfig.apiUrl, {
      params: {
        user: smsConfig.user,
        authkey: smsConfig.authKey,
        sender: smsConfig.sender,
        mobile: phone,
        text: message,
        entityid: smsConfig.entityId,
        templateid: smsConfig.templateId,
      },
    });
    return response.data;
  } catch (error) {
    console.error('SMS sending error:', error);
    throw new Error('Failed to send SMS');
  }
};

module.exports = { sendSMS };