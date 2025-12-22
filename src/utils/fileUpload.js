const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');

// Create the upload directory if it doesn't exist
const uploadDir = path.join(__dirname, '../uploads/profiles');
fs.ensureDirSync(uploadDir);

// Function to normalize file extension (handle uppercase extensions)
const normalizeExtension = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  // Ensure we have a valid extension even if the original doesn't have one
  return ext || '.jpg';
};

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Log information about the incoming file
    console.log('File upload attempt:', {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    });
    
    // Make sure the directory exists
    fs.ensureDirSync(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    try {
      // Create a unique filename with timestamp
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
      const ext = normalizeExtension(file.originalname);
      const newFilename = `profile-${uniqueSuffix}${ext}`;
      
      console.log(`Renaming uploaded file to: ${newFilename}`);
      cb(null, newFilename);
    } catch (error) {
      console.error('Error in filename generation:', error);
      cb(error);
    }
  }
});

// File filter - more permissive for image files
const fileFilter = (req, file, cb) => {
  // Accept image files with broader mime types
  const allowedMimes = [
    'image/jpeg', 
    'image/jpg', 
    'image/png', 
    'image/gif', 
    'image/heic', // iPhone HEIC format
    'image/heif', // HEIF format
    'image/webp'  // WebP format
  ];
  
  // Check if extension is allowed (case-insensitive)
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.heic', '.heif', '.webp'];
  const ext = normalizeExtension(file.originalname);
  
  // Log the file details for debugging
  console.log('File filter check:', {
    mimetype: file.mimetype,
    originalname: file.originalname,
    extension: ext
  });
  
  if (allowedMimes.includes(file.mimetype.toLowerCase()) || 
      allowedExtensions.includes(ext.toLowerCase())) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type: ${file.mimetype}. Only image files (JPEG, JPG, PNG, GIF, HEIC, HEIF, WebP) are allowed.`), false);
  }
};

// Error handling function for multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File is too large. Maximum size is 30MB.'
      });
    }
    return res.status(400).json({
      success: false,
      message: `File upload error: ${err.message}`
    });
  }
  next(err);
};

// Upload middleware with increased file size limit
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 30 * 1024 * 1024, // Increased to 30 MB max file size
  },
  fileFilter: fileFilter
});

module.exports = { 
  upload,
  handleMulterError 
};
