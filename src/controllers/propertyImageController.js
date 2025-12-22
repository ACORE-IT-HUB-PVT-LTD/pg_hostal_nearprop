// Delete property images function
const Property = require("../models/Property");
const s3Upload = require("../utils/s3Upload");

const deletePropertyImages = async (req, res) => {
  try {
    const propertyId = req.params.id || req.body.propertyId;
    
    if (!propertyId) {
      return res.status(400).json({
        success: false,
        message: "Property ID is required"
      });
    }
    
    if (!req.body.imageUrls || !Array.isArray(req.body.imageUrls) || req.body.imageUrls.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Image URLs to delete are required"
      });
    }
    
    // Find property by ID or propertyId
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
    
    // Check if property has images
    if (!property.images || property.images.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Property has no images to delete"
      });
    }
    
    // Filter out images that are in the property's image array
    const imagesToDelete = req.body.imageUrls.filter(url => property.images.includes(url));
    
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
      
      // Update property images array
      const updatedImages = property.images.filter(url => !imagesToDelete.includes(url));
      
      // Save updated property
      property = await Property.findByIdAndUpdate(
        property._id,
        { $set: { images: updatedImages } },
        { new: true }
      );
      
      res.json({
        success: true,
        message: `Successfully deleted ${imagesToDelete.length} images`,
        property
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
    console.error(err.message);
    if (err.kind === "ObjectId") {
      return res.status(404).json({
        success: false,
        message: "Property not found"
      });
    }
    res.status(500).json({
      success: false,
      message: "Server Error"
    });
  }
};

module.exports = deletePropertyImages;
