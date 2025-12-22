// SMS API configuration
require('dotenv').config();

const smsConfig = {
  apiUrl: process.env.SMS_API_URL,
  user: process.env.SMS_USER,
  authKey: process.env.SMS_AUTHKEY,
  sender: process.env.SMS_SENDER,
  entityId: process.env.SMS_ENTITYID,
  templateId: process.env.SMS_TEMPLATEID,
};

module.exports = smsConfig;