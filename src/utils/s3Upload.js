const AWS = require('aws-sdk');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const dotenv = require('dotenv');
const fs = require('fs');

// Load environment variables from .env file
try {
  const envPath = require('path').resolve(__dirname, '../../.env');
  if (fs.existsSync(envPath)) {
    const result = dotenv.config({ path: envPath });
    if (result.error) {
      console.error('Error loading .env file:', result.error);
    }
  } else {
    console.log('.env file not found, using environment variables');
  }
} catch (error) {
  console.log('Continuing without .env file:', error.message);
}

// Configure AWS region and bucket from environment variables
const awsRegion = process.env.AWS_REGION || 'ap-south-1';
const s3BucketName = process.env.S3_BUCKET || 'my-nearprop-bucket';

console.log('S3Upload initialization:');
console.log('- Using AWS region:', awsRegion);
console.log('- Using S3 bucket:', s3BucketName);
console.log('- AWS Access Key ID exists:', !!process.env.AWS_ACCESS_KEY_ID);
console.log('- AWS Secret Access Key exists:', !!process.env.AWS_SECRET_ACCESS_KEY);

// Configure AWS SDK with credentials
if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  console.error('WARNING: AWS credentials are not properly configured in environment variables');
  console.error('File uploads will not work correctly without valid AWS credentials');
  // Continue without throwing error to allow the app to start
}

AWS.config.update({
  credentials: new AWS.Credentials({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }),
  region: awsRegion
});

// Create S3 service object
const s3 = new AWS.S3();

// Configure multer storage
const storage = multer.memoryStorage();

// File filter for images only
const fileFilter = (req, file, cb) => {
  console.log("File upload received:", file.originalname, file.mimetype);
  
  if (!file.originalname.match(/\.(jpg|JPG|jpeg|JPEG|png|PNG|gif|GIF|webp|WEBP)$/)) {
    req.fileValidationError = 'Only image files are allowed!';
    return cb(new Error('Only image files are allowed!'), false);
  }
  cb(null, true);
};

// Export multer configured for image uploads
exports.upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
    files: 10 // Max 10 files
  },
  fileFilter: fileFilter
});

// Upload a single file to S3
exports.uploadFile = async (file, directory) => {
  const fileExtension = path.extname(file.originalname);
  const fileName = `${uuidv4()}${fileExtension}`;
  const key = `${directory}/${fileName}`;

  // Debug logging
  console.log('S3 Upload - File:', file.originalname);
  console.log('Directory:', directory);
  
  const params = {
    Bucket: s3BucketName,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype,
    ACL: 'private' // Make the uploaded file private
  };

  try {
    const result = await s3.upload(params).promise();
    return {
      key: key,
      url: result.Location,
      fileName: fileName,
      originalName: file.originalname
    };
  } catch (error) {
    console.error('Error uploading to S3:', error);
    throw error;
  }
};

// Upload multiple files to S3
exports.uploadMultipleFiles = async (files, directory) => {
  if (!files || files.length === 0) {
    return [];
  }

  const uploadPromises = files.map(file => this.uploadFile(file, directory));
  return Promise.all(uploadPromises);
};

// Get a signed URL for private S3 objects
exports.getSignedUrl = (key, expires = 3600) => {
  const params = {
    Bucket: s3BucketName,
    Key: key,
    Expires: expires
  };

  return s3.getSignedUrl('getObject', params);
};

// Delete a file from S3
exports.deleteFile = async (key) => {
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

// Delete multiple files from S3
exports.deleteMultipleFiles = async (keys) => {
  if (!keys || keys.length === 0) {
    return true;
  }
  
  const params = {
    Bucket: s3BucketName,
    Delete: {
      Objects: keys.map(key => ({ Key: key })),
      Quiet: false
    }
  };

  try {
    await s3.deleteObjects(params).promise();
    return true;
  } catch (error) {
    console.error('Error deleting multiple files from S3:', error);
    throw error;
  }
};
