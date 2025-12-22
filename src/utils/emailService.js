const nodemailer = require('nodemailer');

/**
 * Email service utility
 * Handles sending emails for admin notifications, password resets, etc.
 */
const emailService = {
  /**
   * Send an email
   * @param {Object} options - Email options
   * @param {String} options.to - Recipient email address
   * @param {String} options.subject - Email subject
   * @param {String} options.text - Plain text email body
   * @param {String} options.html - HTML email body
   * @returns {Boolean} - Success status
   */
  sendEmail: async (options) => {
    try {
      // Create transporter
      const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: process.env.EMAIL_PORT || 587,
        secure: process.env.EMAIL_SECURE === 'true',
        auth: {
          user: process.env.EMAIL_USERNAME,
          pass: process.env.EMAIL_PASSWORD
        }
      });
      
      // Setup email options
      const mailOptions = {
        from: process.env.EMAIL_FROM || '"PG Hostel Admin" <noreply@pghostel.com>',
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html
      };
      
      // Send email
      const info = await transporter.sendMail(mailOptions);
      console.log('Email sent: %s', info.messageId);
      
      return true;
    } catch (error) {
      console.error('Email sending failed:', error);
      return false;
    }
  }
};

module.exports = emailService;
