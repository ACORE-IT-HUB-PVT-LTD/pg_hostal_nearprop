const mongoose = require('mongoose');
require('dotenv').config();

// Define the schema with no unique constraints
const tenantSchema = new mongoose.Schema({
  tenantId: { type: String, default: () => `TENANT-${Math.random().toString(36).substr(2, 9)}` },
  name: { type: String, required: true },
  email: { type: String },
  aadhaar: { type: String, required: true },
  mobile: { type: String, required: true },
  // Other fields...
}, { _id: false });

const bedSchema = new mongoose.Schema({
  bedId: { type: String, default: () => `BED-${Math.random().toString(36).substr(2, 9)}` },
  // Other fields...
}, { _id: false });

const roomSchema = new mongoose.Schema({
  roomId: { type: String, default: () => `ROOM-${Math.random().toString(36).substr(2, 9)}` },
  // Other fields...
}, { _id: false });

const propertySchema = new mongoose.Schema({
  propertyId: { type: String, unique: true, default: () => `PROP-${Math.random().toString(36).substr(2, 9)}` },
  // Other fields...
});

async function resetIndexes() {
  try {
    console.log('Attempting to connect to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const collections = await mongoose.connection.db.collections();
    console.log(`Found ${collections.length} collections`);
    
    // Get the properties collection
    const propertiesCollection = mongoose.connection.db.collection('properties');
    
    // List existing indexes
    const indexes = await propertiesCollection.indexes();
    console.log('Current indexes on properties collection:');
    console.log(JSON.stringify(indexes, null, 2));
    
    // Drop all non-default indexes from properties collection
    for (const index of indexes) {
      if (index.name !== '_id_') {
        try {
          console.log(`Attempting to drop index: ${index.name}`);
          await propertiesCollection.dropIndex(index.name);
          console.log(`Successfully dropped index: ${index.name}`);
        } catch (error) {
          console.error(`Error dropping index ${index.name}:`, error.message);
        }
      }
    }
    
    // Register the model with the updated schema (no unique constraints on embedded documents)
    const Property = mongoose.model('Property', propertySchema, 'properties');
    
    // Check if the model is registered correctly
    console.log('Property model registered:', !!mongoose.models.Property);
    
    console.log('Process completed successfully');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
}

resetIndexes().catch(console.error);
