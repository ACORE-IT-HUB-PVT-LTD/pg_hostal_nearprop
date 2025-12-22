const mongoose = require('mongoose');
const redis = require('redis');
require('dotenv').config();

const connectMongoDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/pg_rental_db';
    console.log('Connecting to MongoDB at:', mongoURI);
    await mongoose.connect(mongoURI);
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    // Don't exit process on connection error for development
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
};

// Get Redis connection URL from environment
const redisURL = process.env.REDIS_URL || 'redis://redis:6379';
console.log('Redis configuration:');
console.log('- REDIS_URL:', process.env.REDIS_URL);
console.log('- Using URL:', redisURL);

// Create Redis client with better error handling
const redisConfig = {
  url: redisURL,
  socket: {
    reconnectStrategy: (retries) => {
      console.log(`Redis reconnect attempt ${retries}`);
      return Math.min(retries * 100, 3000); // Increasing backoff with 3s max
    },
    family: 4  // Force IPv4
  }
};

// Only add password if it's actually defined
if (process.env.REDIS_PASSWORD) {
  console.log('Redis password is configured, using authentication');
  redisConfig.password = process.env.REDIS_PASSWORD;
} else {
  console.log('Redis password not configured, skipping authentication');
}

const redisClient = redis.createClient(redisConfig);

// Enhanced event listeners
redisClient.on('error', (err) => console.error('Redis Client Error:', err));
redisClient.on('connect', () => console.log('Redis client connected successfully'));
redisClient.on('ready', () => console.log('Redis client ready'));
redisClient.on('reconnecting', () => console.log('Redis client reconnecting...'));
redisClient.on('end', () => console.log('Redis client connection closed'));

const connectRedis = async () => {
  try {
    console.log('Attempting Redis connection to:', redisURL);
    await redisClient.connect();
    console.log('Redis connected successfully');
  } catch (error) {
    console.error('Redis connection error:', error.message);
    console.log('Application will continue without Redis');
    // Don't exit process, allow app to continue without Redis
  }
};

module.exports = { connectMongoDB, connectRedis, redisClient };