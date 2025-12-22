const AWS = require('aws-sdk');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { execSync } = require('child_process');
require('dotenv').config();

// Check if ffmpeg is installed
try {
  execSync('ffmpeg -version', { stdio: 'ignore' });
  console.log('✅ ffmpeg is installed and working');
} catch (error) {
  console.error('❌ ffmpeg is not installed or not in PATH. Please install ffmpeg for video processing.');
  console.error('   Installation instructions: https://ffmpeg.org/download.html');
  console.error('   For Ubuntu: sudo apt-get update && sudo apt-get install -y ffmpeg');
  console.error('   For macOS: brew install ffmpeg');
}

// Configure AWS SDK with credentials
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'ap-south-1'
});

// Log AWS configuration (with masked keys)
console.log('AWS S3 Configuration:');
console.log('Access Key ID:', process.env.AWS_ACCESS_KEY_ID ? `${process.env.AWS_ACCESS_KEY_ID.substring(0, 4)}...${process.env.AWS_ACCESS_KEY_ID.substring(process.env.AWS_ACCESS_KEY_ID.length - 4)}` : 'not set');
console.log('Secret Access Key:', process.env.AWS_SECRET_ACCESS_KEY ? '********' : 'not set');
console.log('Region:', process.env.AWS_REGION || 'ap-south-1');

// S3 bucket name
const s3BucketName = process.env.S3_BUCKET || 'my-nearprop-bucket';
console.log('S3 Bucket:', s3BucketName);

// Configure multer storage for videos
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    const uploadDir = path.join(__dirname, '../../uploads/temp');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename: function(req, file, cb) {
    // Generate unique filename
    const uniqueFilename = uuidv4() + path.extname(file.originalname);
    cb(null, uniqueFilename);
  }
});

// File filter for videos only
const fileFilter = (req, file, cb) => {
  console.log('File upload info:', {
    originalname: file.originalname,
    mimetype: file.mimetype,
    fieldname: file.fieldname
  });
  
  // Handle Postman cloud references specially
  if (file.originalname.includes('postman-cloud') || file.mimetype.includes('postman-cloud')) {
    console.log('Detected Postman cloud reference, accepting file');
    return cb(null, true);
  }
  
  // Accept various video formats
  if (file.mimetype.startsWith('video/') || 
      file.originalname.endsWith('.mp4') ||
      file.originalname.endsWith('.mov') ||
      file.originalname.endsWith('.avi') ||
      file.originalname.endsWith('.mkv') ||
      file.originalname.endsWith('.wmv') ||
      file.originalname.endsWith('.webm') ||
      file.originalname.endsWith('.flv')) {
    console.log('Detected valid video format, accepting file');
    return cb(null, true);
  }
  
  console.log('Rejecting file - not a supported video format');
  return cb(new Error('Only video files are allowed! Supported formats: mp4, mov, avi, mkv, wmv, webm, flv'), false);
};

// Export multer configured for video uploads
exports.upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
  },
  fileFilter: fileFilter
});

// Generate thumbnail from video with enhanced error handling
exports.generateThumbnail = async (videoPath) => {
  const thumbnailPath = videoPath.replace(path.extname(videoPath), '-thumbnail.jpg');
  
  return new Promise((resolve, reject) => {
    try {
      ffmpeg(videoPath)
        .on('error', (err) => {
          console.error('Error generating thumbnail:', err);
          // Instead of rejecting and breaking the flow, we resolve with null
          // so the upload can continue without a thumbnail
          resolve(null);
        })
        .screenshots({
          timestamps: ['50%'], // Take screenshot at 50% of the video
          filename: path.basename(thumbnailPath),
          folder: path.dirname(videoPath)
        })
        .on('end', () => {
          // Check if thumbnail was actually created
          if (fs.existsSync(thumbnailPath)) {
            resolve(thumbnailPath);
          } else {
            console.warn('Thumbnail generation completed but file not found');
            resolve(null);
          }
        });
    } catch (error) {
      console.error('Unexpected error in thumbnail generation:', error);
      resolve(null); // Continue without thumbnail
    }
  });
};

// Upload video file to S3
exports.uploadVideoToS3 = async (filePath, filename) => {
  const fileStream = fs.createReadStream(filePath);
  const key = `reels/${filename}`;
  
  const params = {
    Bucket: s3BucketName,
    Key: key,
    Body: fileStream,
    ContentType: 'video/mp4',
    ACL: 'private' // Make the uploaded file private
  };
  
  try {
    const result = await s3.upload(params).promise();
    return {
      key: key,
      url: result.Location
    };
  } catch (error) {
    console.error('Error uploading video to S3:', error);
    throw error;
  }
};

// Upload thumbnail to S3
exports.uploadThumbnailToS3 = async (filePath, filename) => {
  const fileStream = fs.createReadStream(filePath);
  const key = `reels/thumbnails/${filename}`;
  
  const params = {
    Bucket: s3BucketName,
    Key: key,
    Body: fileStream,
    ContentType: 'image/jpeg',
    ACL: 'private' // Make the uploaded file private
  };
  
  try {
    const result = await s3.upload(params).promise();
    return {
      key: key,
      url: result.Location
    };
  } catch (error) {
    console.error('Error uploading thumbnail to S3:', error);
    throw error;
  }
};

// Get video duration
exports.getVideoDuration = async (videoPath) => {
  return new Promise((resolve, reject) => {
    try {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          console.error('Error getting video duration:', err);
          resolve(null); // Continue without duration
        } else {
          const durationInSeconds = metadata.format.duration;
          resolve(durationInSeconds);
        }
      });
    } catch (error) {
      console.error('Unexpected error in getVideoDuration:', error);
      resolve(null); // Continue without duration
    }
  });
};

// Get a signed URL for private S3 objects
exports.getSignedUrl = (key, expires = 3600) => {
  if (!key) {
    console.error('Error generating signed URL: key is undefined');
    return null;
  }
  
  try {
    const params = {
      Bucket: s3BucketName,
      Key: key,
      Expires: expires
    };

    console.log(`Generating signed URL for ${key} with expiration ${expires}s`);
    const url = s3.getSignedUrl('getObject', params);
    
    // Return the URL or a fallback
    if (url) {
      return url;
    } else {
      console.error(`Failed to generate signed URL for ${key}`);
      return null;
    }
  } catch (error) {
    console.error(`Error generating signed URL for ${key}: ${error.message}`);
    
    // Return a direct S3 URL as fallback if signed URL generation fails
    return `https://${s3BucketName}.s3.amazonaws.com/${key}`;
  }
};

// Delete a file from S3
exports.deleteFileFromS3 = async (key) => {
  const params = {
    Bucket: s3BucketName,
    Key: key
  };

  try {
    await s3.deleteObject(params).promise();
    return true;
  } catch (error) {
    console.error('Error deleting from S3:', error);
    throw error;
  }
};

// Cleanup temporary files
exports.cleanupTempFiles = (filePaths) => {
  if (!filePaths || !Array.isArray(filePaths)) return;
  
  filePaths.forEach(filePath => {
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (error) {
        console.error(`Error cleaning up temp file ${filePath}:`, error);
      }
    }
  });
};

// Clean up temporary files
exports.cleanupTempFiles = (files) => {
  if (!Array.isArray(files)) {
    files = [files];
  }
  
  files.forEach(file => {
    try {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    } catch (error) {
      console.error(`Error deleting temp file ${file}:`, error);
    }
  });
};

// Get video duration
exports.getVideoDuration = (videoPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        console.error('Error getting video duration:', err);
        return reject(err);
      }
      
      const durationInSeconds = metadata.format.duration;
      resolve(durationInSeconds);
    });
  });
};

// Delete file from S3
exports.deleteFromS3 = (key) => {
  return new Promise((resolve, reject) => {
    const params = {
      Bucket: s3BucketName,
      Key: key
    };
    
    s3.deleteObject(params, (err, data) => {
      if (err) {
        console.error(`Error deleting file ${key} from S3:`, err);
        return reject(err);
      }
      console.log(`Successfully deleted file ${key} from S3`);
      resolve(data);
    });
  });
};
