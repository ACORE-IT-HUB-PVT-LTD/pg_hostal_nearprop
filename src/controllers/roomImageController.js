// Room image controller
const Property = require("../models/Property");
const s3Upload = require("../utils/s3Upload");

// Upload room images
const uploadRoomImages = async (req, res) => {
  try {
    const propertyId = req.params.propertyId || req.body.propertyId;
    const roomId = req.params.roomId || req.body.roomId;
    
    if (!propertyId || !roomId) {
      return res.status(400).json({
        success: false,
        message: "Property ID and Room ID are required"
      });
    }
    
    // Find property
    let property = await Property.findOne({ 
      $or: [
        { _id: propertyId },
        { propertyId: propertyId }
      ]
    });
    
    if (!property) {
      return res.status(404).json({
        success: false,
        message: "Property not found"
      });
    }
    
    // Check if landlord owns this property
    if (property.landlordId.toString() !== req.user.id) {
      return res.status(401).json({
        success: false,
        message: "Not authorized"
      });
    }
    
    // Find the room
    const roomIndex = property.rooms.findIndex(room => room.roomId === roomId);
    if (roomIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Room not found"
      });
    }
    
    // Handle image uploads
    if (req.files && req.files.length > 0) {
      // Check current image count
      const room = property.rooms[roomIndex];
      const currentImageCount = room.images ? room.images.length : 0;
      const maxNewImages = 10 - currentImageCount;
      
      if (maxNewImages <= 0) {
        return res.status(400).json({
          success: false,
          message: "Maximum of 10 images per room allowed. Please delete some images first."
        });
      }
      
      const filesToUpload = req.files.slice(0, maxNewImages);
      
      try {
        // Upload files to S3 in landlord/property/room directory
        const s3Directory = `landlord-property/${req.user.id}/${property.propertyId}/room-${roomId}`;
        const uploadedFiles = await s3Upload.uploadMultipleFiles(filesToUpload, s3Directory);
        
        // Prepare update for images array
        const updatedImages = [
          ...(room.images || []),
          ...uploadedFiles.map(file => file.url)
        ];
        
        // If exceeds 10 images, trim to only keep 10
        if (updatedImages.length > 10) {
          // Delete the extra images from S3
          const imagesToDelete = updatedImages.slice(10);
          const keysToDelete = imagesToDelete.map(url => {
            // Extract the key from the URL
            const urlParts = url.split('/');
            return urlParts.slice(3).join('/'); // Remove https://bucket.s3.region.amazonaws.com/
          });
          
          try {
            await s3Upload.deleteMultipleFiles(keysToDelete);
          } catch (deleteError) {
            console.error('Error deleting extra images from S3:', deleteError);
          }
          
          updatedImages.splice(10); // Keep only first 10 images
        }
        
        // Update property with new room images
        property.rooms[roomIndex].images = updatedImages;
        
        // Save the updated property
        await property.save();
        
        res.json({
          success: true,
          room: property.rooms[roomIndex]
        });
      } catch (uploadError) {
        console.error('Error uploading images to S3:', uploadError);
        return res.status(500).json({
          success: false,
          message: "Error uploading room images",
          error: uploadError.message
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: "No images provided"
      });
    }
  } catch (err) {
    console.error('Error in uploadRoomImages:', err);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message
    });
  }
};

// Delete room images
const deleteRoomImages = async (req, res) => {
  try {
    const propertyId = req.params.propertyId || req.body.propertyId;
    const roomId = req.params.roomId || req.body.roomId;
    
    if (!propertyId || !roomId) {
      return res.status(400).json({
        success: false,
        message: "Property ID and Room ID are required"
      });
    }
    
    if (!req.body.imageUrls || !Array.isArray(req.body.imageUrls) || req.body.imageUrls.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Image URLs to delete are required"
      });
    }
    
    // Find property
    let property = await Property.findOne({ 
      $or: [
        { _id: propertyId },
        { propertyId: propertyId }
      ]
    });
    
    if (!property) {
      return res.status(404).json({
        success: false,
        message: "Property not found"
      });
    }
    
    // Check if landlord owns this property
    if (property.landlordId.toString() !== req.user.id) {
      return res.status(401).json({
        success: false,
        message: "Not authorized"
      });
    }
    
    // Find the room
    const roomIndex = property.rooms.findIndex(room => room.roomId === roomId);
    if (roomIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Room not found"
      });
    }
    
    const room = property.rooms[roomIndex];
    
    // Check if room has images
    if (!room.images || room.images.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Room has no images to delete"
      });
    }
    
    // Filter out images that are in the room's image array
    const imagesToDelete = req.body.imageUrls.filter(url => room.images.includes(url));
    
    if (imagesToDelete.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid images to delete"
      });
    }
    
    // Extract S3 keys from URLs
    const keysToDelete = imagesToDelete.map(url => {
      // Extract the key from the URL
      const urlParts = url.split('/');
      return urlParts.slice(3).join('/'); // Remove https://bucket.s3.region.amazonaws.com/
    });
    
    try {
      // Delete from S3
      await s3Upload.deleteMultipleFiles(keysToDelete);
      
      // Update room images array
      property.rooms[roomIndex].images = room.images.filter(url => !imagesToDelete.includes(url));
      
      // Save updated property
      await property.save();
      
      res.json({
        success: true,
        message: `Successfully deleted ${imagesToDelete.length} images`,
        room: property.rooms[roomIndex]
      });
    } catch (deleteError) {
      console.error('Error deleting images from S3:', deleteError);
      return res.status(500).json({
        success: false,
        message: "Error deleting images from S3",
        error: deleteError.message
      });
    }
  } catch (err) {
    console.error('Error in deleteRoomImages:', err);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message
    });
  }
};

module.exports = {
  uploadRoomImages,
  deleteRoomImages
};
