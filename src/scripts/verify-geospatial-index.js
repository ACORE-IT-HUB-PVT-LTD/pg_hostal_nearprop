/**
 * Verify MongoDB Geospatial Index
 * 
 * This script checks if the 2dsphere index exists on the Property collection
 * and creates it if it doesn't exist. This ensures that geospatial queries 
 * will work correctly.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Property = require('../models/Property');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB');
  verifyIndex();
}).catch(err => {
  console.error('Error connecting to MongoDB:', err);
  process.exit(1);
});

// Main function to verify/create the index
async function verifyIndex() {
  try {
    // Check if the collection has a 2dsphere index on location
    const indexes = await Property.collection.indexes();
    const hasGeoIndex = indexes.some(index => 
      index.key && index.key.location === '2dsphere'
    );
    
    if (hasGeoIndex) {
      console.log('✅ Geospatial index (2dsphere) already exists on the location field');
    } else {
      console.log('⚠️ Geospatial index not found, creating one...');
      
      // Create the index
      await Property.collection.createIndex({ location: '2dsphere' });
      console.log('✅ Created 2dsphere index on the location field');
    }
    
    // Disconnect from MongoDB
    mongoose.disconnect();
    console.log('Database connection closed');
  } catch (error) {
    console.error('Error verifying/creating index:', error);
    mongoose.disconnect();
    process.exit(1);
  }
}
