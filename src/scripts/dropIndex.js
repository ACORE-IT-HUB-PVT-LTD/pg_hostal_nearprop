const mongoose = require('mongoose');
require('dotenv').config();

async function dropIndexes() {
  try {
    console.log('Attempting to connect to MongoDB with URI:', process.env.MONGODB_URI);
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Get the properties collection
    const collection = mongoose.connection.db.collection('properties');
    
    // List all indexes
    const indexes = await collection.indexes();
    console.log('Current indexes:', indexes);
    
    // Drop the problematic index
    try {
      await collection.dropIndex('rooms.beds.tenants.tenantId_1');
      console.log('Successfully dropped the index: rooms.beds.tenants.tenantId_1');
    } catch (error) {
      console.log('Error dropping index rooms.beds.tenants.tenantId_1:', error.message);
      // Try alternative index names
      try {
        await collection.dropIndex('rooms.beds.tenants.tenantId_1_rooms.beds.tenants.tenantId_1');
        console.log('Successfully dropped the alternative index name');
      } catch (err) {
        console.log('Error dropping alternative index:', err.message);
      }
    }
    
    // Check remaining indexes
    const remainingIndexes = await collection.indexes();
    console.log('Remaining indexes:', remainingIndexes);
    
    console.log('Process completed successfully');
  } catch (error) {
    console.error('Error details:', error);
    if (error.message && error.message.includes('ECONNREFUSED')) {
      console.error('Connection refused. Make sure MongoDB is running on the correct port.');
    }
  } finally {
    try {
      // Close the connection if it was opened
      if (mongoose.connection && mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
        console.log('MongoDB connection closed');
      }
    } catch (err) {
      console.error('Error closing connection:', err);
    }
  }
}

// Run the function
dropIndexes().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
