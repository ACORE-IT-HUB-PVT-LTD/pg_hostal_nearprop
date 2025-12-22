/**
 * Script to update location field for all existing properties
 * This will add GeoJSON location points to properties that already have lat/lng
 */

const mongoose = require('mongoose');
const Property = require('../models/Property');
const config = require('../config/database');

// Connect to MongoDB
mongoose.connect(config.database, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB for location update');
  updatePropertyLocations();
}).catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

async function updatePropertyLocations() {
  try {
    // Find all properties that have latitude and longitude
    const properties = await Property.find({
      latitude: { $exists: true, $ne: null },
      longitude: { $exists: true, $ne: null }
    });
    
    console.log(`Found ${properties.length} properties with coordinates to update`);
    
    let updatedCount = 0;
    let skippedCount = 0;
    
    for (const property of properties) {
      if (property.latitude && property.longitude) {
        property.location = {
          type: 'Point',
          coordinates: [property.longitude, property.latitude] // GeoJSON uses [longitude, latitude]
        };
        
        await property.save();
        updatedCount++;
        
        console.log(`Updated property ${property.propertyId} (${property.name}): [${property.longitude}, ${property.latitude}]`);
      } else {
        skippedCount++;
        console.log(`Skipped property ${property.propertyId} (${property.name}): missing valid coordinates`);
      }
    }
    
    console.log('\nLocation update complete:');
    console.log(`- Updated: ${updatedCount} properties`);
    console.log(`- Skipped: ${skippedCount} properties`);
    console.log(`- Total: ${properties.length} properties\n`);
    
    // Ensure the geospatial index exists
    await Property.collection.createIndex({ location: "2dsphere" });
    console.log('Geospatial index created successfully');
    
    // Close the connection
    mongoose.connection.close();
    console.log('MongoDB connection closed');
  } catch (error) {
    console.error('Error updating property locations:', error);
    mongoose.connection.close();
    process.exit(1);
  }
}
