// Script to drop indexes in Landlord model
const mongoose = require('mongoose');
require('dotenv').config();

async function dropPanIndex() {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected');

    // Get the Landlord collection
    const db = mongoose.connection.db;
    const landlordCollection = db.collection('landlords');

    // Drop the problematic index
    console.log('Dropping indexes...');
    try {
      await landlordCollection.dropIndex('pan_1');
      console.log('Index pan_1 dropped successfully');
    } catch (indexError) {
      console.log('Error dropping pan_1 index:', indexError.message);
      console.log('Trying alternative index names...');
      
      try {
        await landlordCollection.dropIndex('panNumber_1');
        console.log('Index panNumber_1 dropped successfully');
      } catch (err) {
        console.log('Error dropping panNumber_1 index:', err.message);
      }
    }

    // List remaining indexes
    const indexes = await landlordCollection.indexes();
    console.log('Remaining indexes:', indexes);

    // Success
    console.log('Index cleanup completed successfully');
  } catch (error) {
    console.error('Error during index cleanup:', error.message);
    if (error.message.includes("index not found with name")) {
      console.log('Index does not exist, no need to drop');
    }
  } finally {
    // Close connection
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
    process.exit(0);
  }
}

// Run the function
dropPanIndex();
