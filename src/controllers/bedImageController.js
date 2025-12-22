// Bed image controller
const Property = require("../models/Property");
const s3Upload = require("../utils/s3Upload");

// Upload bed images
const uploadBedImages = async (req, res) => {
  try {
    const propertyId = req.params.propertyId || req.body.propertyId;
    const roomId = req.params.roomId || req.body.roomId;
    const bedId = req.params.bedId || req.body.bedId;
    
    if (!propertyId || !roomId || !bedId) {
      return res.status(400).json({
        success: false,
        message: "Property ID, Room ID, and Bed ID are required"
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
    
    // Find the bed
    const bedIndex = property.rooms[roomIndex].beds.findIndex(bed => bed.bedId === bedId);
    if (bedIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Bed not found"
      });
    }
    
    // Handle image uploads
    if (req.files && req.files.length > 0) {
      // Check current image count
      const bed = property.rooms[roomIndex].beds[bedIndex];
      const currentImageCount = bed.images ? bed.images.length : 0;
      const maxNewImages = 5 - currentImageCount; // Limit to 5 images per bed
      
      if (maxNewImages <= 0) {
        return res.status(400).json({
          success: false,
          message: "Maximum of 5 images per bed allowed. Please delete some images first."
        });
      }
      
      const filesToUpload = req.files.slice(0, maxNewImages);
      
      try {
        // Upload files to S3 in landlord/property/room/bed directory
        const s3Directory = `landlord-property/${req.user.id}/${property.propertyId}/room-${roomId}/bed-${bedId}`;
        const uploadedFiles = await s3Upload.uploadMultipleFiles(filesToUpload, s3Directory);
        
        // Prepare update for images array
        const updatedImages = [
          ...(bed.images || []),
          ...uploadedFiles.map(file => file.url)
        ];
        
        // If exceeds 5 images, trim to only keep 5
        if (updatedImages.length > 5) {
          // Delete the extra images from S3
          const imagesToDelete = updatedImages.slice(5);
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
          
          updatedImages.splice(5); // Keep only first 5 images
        }
        
        // Update property with new bed images
        // First, check if the bed object has an images property
        if (!property.rooms[roomIndex].beds[bedIndex].images) {
          property.rooms[roomIndex].beds[bedIndex].images = [];
        }
        
        // Now assign the updated images
        property.rooms[roomIndex].beds[bedIndex].images = updatedImages;
        
        // Save the updated property
        await property.save();
        
        res.json({
          success: true,
          bed: property.rooms[roomIndex].beds[bedIndex]
        });
      } catch (uploadError) {
        console.error('Error uploading images to S3:', uploadError);
        return res.status(500).json({
          success: false,
          message: "Error uploading bed images",
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
    console.error('Error in uploadBedImages:', err);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message
    });
  }
};

// Delete bed images
const deleteBedImages = async (req, res) => {
  try {
    const propertyId = req.params.propertyId || req.body.propertyId;
    const roomId = req.params.roomId || req.body.roomId;
    const bedId = req.params.bedId || req.body.bedId;
    
    if (!propertyId || !roomId || !bedId) {
      return res.status(400).json({
        success: false,
        message: "Property ID, Room ID, and Bed ID are required"
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
    
    // Find the bed
    const bedIndex = property.rooms[roomIndex].beds.findIndex(bed => bed.bedId === bedId);
    if (bedIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Bed not found"
      });
    }
    
    const bed = property.rooms[roomIndex].beds[bedIndex];
    
    // Check if bed has images
    if (!bed.images || bed.images.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Bed has no images to delete"
      });
    }
    
    // Filter out images that are in the bed's image array
    const imagesToDelete = req.body.imageUrls.filter(url => bed.images.includes(url));
    
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
      
      // Update bed images array
      property.rooms[roomIndex].beds[bedIndex].images = bed.images.filter(url => !imagesToDelete.includes(url));
      
      // Save updated property
      await property.save();
      
      res.json({
        success: true,
        message: `Successfully deleted ${imagesToDelete.length} images`,
        bed: property.rooms[roomIndex].beds[bedIndex]
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
    console.error('Error in deleteBedImages:', err);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message
    });
  }
};

module.exports = {
  uploadBedImages,
  deleteBedImages
};
