/**
 * Script to update properties with missing coordinates
 * Uses the Google Maps API to get coordinates from addresses
 */
const mongoose = require('mongoose');
const Property = require('../models/Property');
const { getCoordinatesFromAddress } = require('../utils/locationUtils');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

async function updatePropertiesWithCoordinates() {
  try {
    // Connect to MongoDB
    const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/pg_rental_db';
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('MongoDB connected...');

    // Find properties missing coordinates
    const properties = await Property.find({
      $or: [
        { latitude: { $exists: false } },
        { longitude: { $exists: false } },
        { latitude: null },
        { longitude: null }
      ]
    });

    console.log(`Found ${properties.length} properties missing coordinates`);

    // Update each property with coordinates
    let updatedCount = 0;
    for (const property of properties) {
      // Skip if no address
      if (!property.address) {
        console.log(`Property ${property._id} has no address, skipping...`);
        continue;
      }

      // Generate address string
      const addressParts = [
        property.address,
        property.city,
        property.state,
        property.pinCode
      ].filter(Boolean);
      const fullAddress = addressParts.join(', ');

      console.log(`Getting coordinates for: ${fullAddress}`);

      // Get coordinates from address
      const locationData = await getCoordinatesFromAddress(fullAddress);

      // Skip if no coordinates found
      if (!locationData || !locationData.lat || !locationData.lng) {
        console.log(`Could not get coordinates for: ${fullAddress}`);
        continue;
      }

      console.log(`Found coordinates: ${locationData.lat}, ${locationData.lng}`);

      // Update property
      property.latitude = locationData.lat;
      property.longitude = locationData.lng;
      await property.save();

      updatedCount++;
      console.log(`Updated property ${property._id}`);

      // Add a delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log(`Updated ${updatedCount} out of ${properties.length} properties with coordinates`);
  } catch (error) {
    console.error('Error updating properties with coordinates:', error);
  } finally {
    // Disconnect from MongoDB
    mongoose.disconnect();
    console.log('MongoDB disconnected');
  }
}

// Run the function if this script is executed directly
if (require.main === module) {
  updatePropertiesWithCoordinates();
}

module.exports = updatePropertiesWithCoordinates;
