const nodemailer = require('nodemailer');
const config = require('../config/config');

/**
 * Service for sending notifications to users and landlords
 * about reel interactions
 */
class NotificationService {
  constructor() {
    // Initialize email transporter if email config is available
    if (config.email && config.email.host) {
      this.transporter = nodemailer.createTransport({
        host: config.email.host,
        port: config.email.port,
        secure: config.email.secure,
        auth: {
          user: config.email.user,
          pass: config.email.pass
        }
      });
    }
  }

  /**
   * Send a notification when someone likes a reel
   * @param {string} landlordId - ID of the landlord who owns the reel
   * @param {string} reelId - ID of the reel
   * @param {object} user - User who liked the reel
   * @param {string} reelTitle - Title of the reel
   */
  async sendLikeNotification(landlordId, reelId, user, reelTitle) {
    try {
      // Store notification in database
      await this._storeNotification({
        recipientId: landlordId,
        type: 'like',
        reelId,
        actorId: user._id,
        actorName: user.name,
        actorPhoto: user.profilePhoto,
        reelTitle,
        message: `${user.name} liked your reel "${reelTitle}"`
      });

      // Send email notification
      if (this.transporter) {
        await this._sendEmail(
          landlordId,
          `New Like on Your Reel: "${reelTitle}"`,
          `${user.name} (${user.email || user.mobile || 'No contact info'}) liked your reel "${reelTitle}"`,
          `<p><strong>${user.name}</strong> liked your reel "<strong>${reelTitle}</strong>".</p>
           <p>User details:</p>
           <ul>
             <li>Name: ${user.name}</li>
             <li>Email: ${user.email || 'Not provided'}</li>
             <li>Mobile: ${user.mobile || 'Not provided'}</li>
           </ul>
           <p>View your reel activity in the dashboard.</p>`
        );
      }

      console.log(`✅ Like notification sent for reel: ${reelId}`);
      return true;
    } catch (error) {
      console.error('❌ Error sending like notification:', error);
      return false;
    }
  }

  /**
   * Send a notification when someone comments on a reel
   * @param {string} landlordId - ID of the landlord who owns the reel
   * @param {string} reelId - ID of the reel
   * @param {object} user - User who commented on the reel
   * @param {string} comment - The comment text
   * @param {string} reelTitle - Title of the reel
   */
  async sendCommentNotification(landlordId, reelId, user, comment, reelTitle) {
    try {
      // Store notification in database
      await this._storeNotification({
        recipientId: landlordId,
        type: 'comment',
        reelId,
        actorId: user._id,
        actorName: user.name,
        actorPhoto: user.profilePhoto,
        reelTitle,
        message: `${user.name} commented on your reel "${reelTitle}": "${comment.substring(0, 30)}${comment.length > 30 ? '...' : ''}"`,
        commentText: comment
      });

      // Send email notification
      if (this.transporter) {
        await this._sendEmail(
          landlordId,
          `New Comment on Your Reel: "${reelTitle}"`,
          `${user.name} commented: "${comment}"`,
          `<p><strong>${user.name}</strong> commented on your reel "<strong>${reelTitle}</strong>":</p>
           <p>"${comment}"</p>
           <p>User details:</p>
           <ul>
             <li>Name: ${user.name}</li>
             <li>Email: ${user.email || 'Not provided'}</li>
             <li>Mobile: ${user.mobile || 'Not provided'}</li>
           </ul>
           <p>View your reel activity in the dashboard.</p>`
        );
      }

      console.log(`✅ Comment notification sent for reel: ${reelId}`);
      return true;
    } catch (error) {
      console.error('❌ Error sending comment notification:', error);
      return false;
    }
  }

  /**
   * Store notification in database
   * @param {object} notification - Notification data
   * @private
   */
  async _storeNotification(notification) {
    try {
      // If we have a notification model, use it
      if (global.models && global.models.Notification) {
        const { Notification } = global.models;
        await Notification.create(notification);
      } else {
        // Otherwise, just log the notification
        console.log(`📣 Notification: ${notification.message}`);
      }
    } catch (error) {
      console.error('Error storing notification:', error);
    }
  }

  /**
   * Send email to landlord
   * @param {string} landlordId - ID of the landlord
   * @param {string} subject - Email subject
   * @param {string} textContent - Plain text content
   * @param {string} htmlContent - HTML content
   * @private
   */
  async _sendEmail(landlordId, subject, textContent, htmlContent) {
    try {
      // Get landlord email
      const { Landlord } = require('../models/Landlord');
      const landlord = await Landlord.findById(landlordId);
      
      if (!landlord || !landlord.email) {
        console.log('Landlord not found or no email available');
        return;
      }

      // Send email
      await this.transporter.sendMail({
        from: `"PG Hostel" <${config.email.user}>`,
        to: landlord.email,
        subject,
        text: textContent,
        html: htmlContent
      });
      
      console.log(`📧 Email sent to ${landlord.email}`);
    } catch (error) {
      console.error('Error sending email:', error);
    }
  }
  
  /**
   * Send a notification when someone shares a reel
   * @param {string} landlordId - ID of the landlord who owns the reel
   * @param {string} reelId - ID of the reel
   * @param {object} user - User who shared the reel
   * @param {string} platform - Platform the reel was shared to
   * @param {string} reelTitle - Title of the reel
   */
  async sendShareNotification(landlordId, reelId, user, platform, reelTitle) {
    try {
      // Store notification in database
      await this._storeNotification({
        recipientId: landlordId,
        type: 'share',
        reelId,
        actorId: user._id,
        actorName: user.name,
        actorPhoto: user.profilePhoto,
        reelTitle,
        message: `${user.name} shared your reel "${reelTitle}" on ${platform}`
      });

      // Send email notification
      if (this.transporter) {
        await this._sendEmail(
          landlordId,
          `Your Reel "${reelTitle}" Was Shared`,
          `${user.name} shared your reel "${reelTitle}" on ${platform}`,
          `<p><strong>${user.name}</strong> shared your reel "<strong>${reelTitle}</strong>" on ${platform}.</p>
           <p>User details:</p>
           <ul>
             <li>Name: ${user.name}</li>
             <li>Email: ${user.email || 'Not provided'}</li>
             <li>Mobile: ${user.mobile || 'Not provided'}</li>
           </ul>
           <p>This could bring more visibility to your property!</p>
           <p>View your reel activity in the dashboard.</p>`
        );
      }

      console.log(`✅ Share notification sent for reel: ${reelId}`);
      return true;
    } catch (error) {
      console.error('❌ Error sending share notification:', error);
      return false;
    }
  }
  
  /**
   * Send a notification when someone saves a reel
   * @param {string} landlordId - ID of the landlord who owns the reel
   * @param {string} reelId - ID of the reel
   * @param {object} user - User who saved the reel
   * @param {string} reelTitle - Title of the reel
   */
  async sendSaveNotification(landlordId, reelId, user, reelTitle) {
    try {
      // Store notification in database
      await this._storeNotification({
        recipientId: landlordId,
        type: 'save',
        reelId,
        actorId: user._id,
        actorName: user.name,
        actorPhoto: user.profilePhoto,
        reelTitle,
        message: `${user.name} saved your reel "${reelTitle}"`
      });

      // Send email notification
      if (this.transporter) {
        await this._sendEmail(
          landlordId,
          `Your Reel "${reelTitle}" Was Saved`,
          `${user.name} saved your reel "${reelTitle}" to their collection`,
          `<p><strong>${user.name}</strong> saved your reel "<strong>${reelTitle}</strong>" to their collection.</p>
           <p>User details:</p>
           <ul>
             <li>Name: ${user.name}</li>
             <li>Email: ${user.email || 'Not provided'}</li>
             <li>Mobile: ${user.mobile || 'Not provided'}</li>
           </ul>
           <p>This indicates strong interest in your property!</p>
           <p>View your reel activity in the dashboard.</p>`
        );
      }

      console.log(`✅ Save notification sent for reel: ${reelId}`);
      return true;
    } catch (error) {
      console.error('❌ Error sending save notification:', error);
      return false;
    }
  }
  
  /**
   * Send a notification for anonymous user interactions
   * @param {string} landlordId - ID of the landlord who owns the reel
   * @param {string} reelId - ID of the reel
   * @param {string} reelTitle - Title of the reel
   * @param {string} interactionType - Type of interaction (like, share, comment, save)
   * @param {object} anonymousInfo - Anonymous user information (if available)
   * @param {string} additionalText - Additional context (comment text, share platform, etc)
   */
  async sendAnonymousInteractionNotification(landlordId, reelId, reelTitle, interactionType, anonymousInfo = {}, additionalText = '') {
    try {
      // Get action text based on interaction type
      let actionText = '';
      let subjectLine = '';
      
      switch(interactionType) {
        case 'like':
          actionText = 'liked';
          subjectLine = `Anonymous User Liked Your Reel: "${reelTitle}"`;
          break;
        case 'comment':
          actionText = 'commented on';
          subjectLine = `Anonymous Comment on Your Reel: "${reelTitle}"`;
          break;
        case 'share':
          actionText = 'shared';
          subjectLine = `Your Reel "${reelTitle}" Was Shared`;
          break;
        case 'save':
          actionText = 'saved';
          subjectLine = `Your Reel "${reelTitle}" Was Saved`;
          break;
        default:
          actionText = 'interacted with';
          subjectLine = `Anonymous Interaction on Your Reel: "${reelTitle}"`;
      }
      
      // Create message with available info
      let userName = 'An anonymous user';
      if (anonymousInfo.name) userName = anonymousInfo.name;
      if (anonymousInfo.ipAddress) userName += ` (IP: ${anonymousInfo.ipAddress})`;
      
      // Store notification in database
      await this._storeNotification({
        recipientId: landlordId,
        type: interactionType,
        reelId,
        actorName: userName,
        reelTitle,
        message: `${userName} ${actionText} your reel "${reelTitle}"${additionalText ? ': ' + additionalText : ''}`,
        additionalInfo: anonymousInfo
      });

      // Send email notification if configured
      if (this.transporter) {
        // Prepare additional details if available
        const deviceInfo = anonymousInfo.userAgent ? 
          `<p>Device Info: ${anonymousInfo.userAgent}</p>` : '';
        const locationInfo = anonymousInfo.location ? 
          `<p>Location: ${anonymousInfo.location}</p>` : '';
        
        await this._sendEmail(
          landlordId,
          subjectLine,
          `${userName} ${actionText} your reel "${reelTitle}"${additionalText ? ': ' + additionalText : ''}`,
          `<p><strong>${userName}</strong> ${actionText} your reel "<strong>${reelTitle}</strong>"${additionalText ? ': <em>' + additionalText + '</em>' : ''}.</p>
           ${deviceInfo}
           ${locationInfo}
           <p>View your reel activity in the dashboard.</p>`
        );
      }

      console.log(`✅ Anonymous ${interactionType} notification sent for reel: ${reelId}`);
      return true;
    } catch (error) {
      console.error(`❌ Error sending anonymous ${interactionType} notification:`, error);
      return false;
    }
  }
}

// Create an instance of the notification service
const notificationService = new NotificationService();

// Export the service
module.exports = notificationService;
