const multer = require('multer');

/**
 * Enhanced error handling middleware for file uploads
 * Handles various file upload errors with detailed messages
 */
const fileUploadErrorHandler = (err, req, res, next) => {
  console.error('File upload error:', err);
  
  // Handle Multer-specific errors
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File is too large. Maximum size is 30MB',
        code: 'FILE_TOO_LARGE'
      });
    }
    
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected file field. Use "profilePhoto" for uploading images.',
        code: 'INVALID_FIELD'
      });
    }
    
    // Handle other Multer errors
    return res.status(400).json({
      success: false,
      message: `File upload error: ${err.message}`,
      code: err.code
    });
  }
  
  // Handle file type validation errors
  if (err.message && err.message.includes('Invalid file type')) {
    return res.status(400).json({ 
      success: false, 
      message: err.message,
      code: 'INVALID_FILE_TYPE'
    });
  }
  
  // For iPhone photo specific issues
  if (err.message && (
    err.message.includes('HEIC') || 
    err.message.includes('iPhone') || 
    err.message.includes('IMG_')
  )) {
    return res.status(400).json({
      success: false,
      message: 'iPhone photo format issue. Please convert your photo to JPEG format before uploading.',
      code: 'IPHONE_FORMAT_ISSUE',
      details: err.message
    });
  }
  
  // Pass to next error handler if not a file upload error
  next(err);
};

module.exports = { fileUploadErrorHandler };
