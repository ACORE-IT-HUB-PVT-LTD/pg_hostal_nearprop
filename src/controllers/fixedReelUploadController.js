const mongoose = require('mongoose');
const { Reel } = require('../models/Reel');
const Property = require('../models/Property');
const Room = require('../models/Room');
const Bed = require('../models/Bed');
const reelUploadService = require('../utils/reelUploadService');
const fs = require('fs');
const path = require('path');

/**
 * Fixed version of uploadReel that handles both MongoDB ObjectIds and custom string IDs
 * for rooms and beds
 */
const uploadReelFixed = async (req, res) => {
  try {
    console.log('🔍 Using fixed reel upload controller');
    console.log('Request body:', JSON.stringify(req.body));
    console.log('Request file:', req.file ? {
      filename: req.file.filename,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    } : 'No file uploaded');
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Video file is required. Please upload a video file.'
      });
    }

    const { title, description, propertyId, roomId, bedId, tags } = req.body;
    const landlordId = req.user.id;
    
    // Validate if property exists and belongs to the landlord
    if (!propertyId) {
      return res.status(400).json({
        success: false,
        message: 'Property ID is required'
      });
    }

    // Always validate using MongoDB ObjectId for property
    if (!mongoose.Types.ObjectId.isValid(propertyId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid property ID format'
      });
    }

    const property = await Property.findOne({ _id: propertyId, landlordId });
    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found or does not belong to this landlord'
      });
    }
    
    let roomData = null;
    let bedData = null;
    
    // Validate room if provided - support both ObjectId and custom ID formats
    if (roomId) {
      console.log(`🔍 Looking for room with ID/Number: ${roomId} in property ${propertyId}`);
      
      try {
        // For custom string IDs like "PROP69-R3", directly search by roomNumber
        if (!mongoose.Types.ObjectId.isValid(roomId) && roomId.includes('-')) {
          console.log(`Looking for room with custom format roomNumber: ${roomId}`);
          roomData = await Room.findOne({ roomNumber: roomId });
          
          // If not found, try a case-insensitive search
          if (!roomData) {
            console.log(`Trying case-insensitive search for roomNumber: ${roomId}`);
            roomData = await Room.findOne({ 
              roomNumber: { $regex: new RegExp('^' + roomId + '$', 'i') }
            });
          }
        } 
        // If it's a valid ObjectId, try finding by ID
        else if (mongoose.Types.ObjectId.isValid(roomId)) {
          console.log(`Looking for room with ObjectId: ${roomId}`);
          roomData = await Room.findOne({ _id: roomId });
        }
        // Otherwise, try both methods
        else {
          console.log(`Trying multiple search methods for room: ${roomId}`);
          roomData = await Room.findOne({ 
            $or: [
              { _id: mongoose.Types.ObjectId.isValid(roomId) ? roomId : null },
              { roomNumber: roomId }
            ]
          });
        }
        
        // Log search results
        if (roomData) {
          console.log(`✅ Room found: ${roomData._id}, roomNumber: ${roomData.roomNumber}`);
        } else {
          console.log(`❌ Room not found with identifier: ${roomId}`);
          
          // Debug: List all rooms to help diagnose the issue
          console.log('Listing available rooms for this property:');
          const allRooms = await Room.find({ propertyId: property._id }).limit(5);
          allRooms.forEach(room => {
            console.log(`- Room: ${room._id}, Number: ${room.roomNumber}, Name: ${room.name}`);
          });
          
          return res.status(404).json({
            success: false,
            message: `Room not found with ID/Number: ${roomId}`,
            details: 'Check if the room exists in this property with the correct ID/number'
          });
        }
      } catch (err) {
        console.error(`Error finding room:`, err);
        return res.status(500).json({
          success: false,
          message: 'Error finding room',
          error: err.message
        });
      }
      
      // Validate bed if provided - support both ObjectId and custom ID formats
      if (bedId) {
        console.log(`🔍 Looking for bed with ID/Number: ${bedId} in room ${roomData._id}`);
        
        try {
          // For custom string IDs like "BED-1", directly search by bedNumber
          if (!mongoose.Types.ObjectId.isValid(bedId) && bedId.includes('-')) {
            console.log(`Looking for bed with custom format bedNumber: ${bedId}`);
            bedData = await Bed.findOne({ bedNumber: bedId, roomId: roomData._id });
            
            // If not found, try a case-insensitive search
            if (!bedData) {
              console.log(`Trying case-insensitive search for bedNumber: ${bedId}`);
              bedData = await Bed.findOne({ 
                bedNumber: { $regex: new RegExp('^' + bedId + '$', 'i') },
                roomId: roomData._id 
              });
            }
          } 
          // If it's a valid ObjectId, try finding by ID
          else if (mongoose.Types.ObjectId.isValid(bedId)) {
            console.log(`Looking for bed with ObjectId: ${bedId}`);
            bedData = await Bed.findOne({ _id: bedId, roomId: roomData._id });
          }
          // Otherwise, try both methods
          else {
            console.log(`Trying multiple search methods for bed: ${bedId}`);
            bedData = await Bed.findOne({ 
              $or: [
                { _id: mongoose.Types.ObjectId.isValid(bedId) ? bedId : null },
                { bedNumber: bedId }
              ],
              roomId: roomData._id
            });
          }
          
          // Log search results
          if (bedData) {
            console.log(`✅ Bed found: ${bedData._id}, bedNumber: ${bedData.bedNumber}`);
          } else {
            console.log(`❌ Bed not found with identifier: ${bedId}`);
            
            // Debug: List all beds to help diagnose the issue
            console.log('Listing available beds for this room:');
            const allBeds = await Bed.find({ roomId: roomData._id }).limit(5);
            allBeds.forEach(bed => {
              console.log(`- Bed: ${bed._id}, Number: ${bed.bedNumber}, Type: ${bed.bedType}`);
            });
            
            return res.status(404).json({
              success: false,
              message: `Bed not found with ID/Number: ${bedId} in room ${roomData._id}`,
              details: 'Check if the bed exists in this room with the correct ID/number'
            });
          }
        } catch (err) {
          console.error(`Error finding bed:`, err);
          return res.status(500).json({
            success: false,
            message: 'Error finding bed',
            error: err.message
          });
        }
      }
    }
    
    const videoPath = req.file.path;
    const videoFilename = req.file.filename;
    
    // Generate thumbnail
    let thumbnailPath;
    try {
      thumbnailPath = await reelUploadService.generateThumbnail(videoPath);
    } catch (error) {
      console.error('Error generating thumbnail:', error);
      // Continue without thumbnail if generation fails
    }
    
    // Get video duration
    let duration;
    try {
      duration = await reelUploadService.getVideoDuration(videoPath);
    } catch (error) {
      console.error('Error getting video duration:', error);
      // Continue without duration if getting duration fails
    }
    
    // Upload video to S3
    const videoUpload = await reelUploadService.uploadVideoToS3(videoPath, videoFilename);
    
    // Upload thumbnail to S3 if available
    let thumbnailUpload = null;
    if (thumbnailPath) {
      const thumbnailFilename = path.basename(thumbnailPath);
      thumbnailUpload = await reelUploadService.uploadThumbnailToS3(thumbnailPath, thumbnailFilename);
    }
    
    // Parse tags if provided
    let parsedTags = [];
    if (tags) {
      try {
        if (typeof tags === 'string') {
          // Try parsing as JSON first
          try {
            parsedTags = JSON.parse(tags);
          } catch {
            // If parsing fails, try comma separated string
            parsedTags = tags.split(',').map(tag => tag.trim());
          }
        } else if (Array.isArray(tags)) {
          parsedTags = tags;
        }
      } catch (error) {
        console.error('Error parsing tags:', error);
        // Continue without tags if parsing fails
      }
    }
    
    // Create reel document - using the roomId and bedId from the found documents
    const reel = new Reel({
      landlordId,
      title,
      description,
      propertyId: property._id,
      roomId: roomData ? roomData._id : undefined, // Use the actual ObjectId from the found room
      bedId: bedData ? bedData._id : undefined, // Use the actual ObjectId from the found bed
      videoKey: videoUpload.key,
      videoUrl: videoUpload.url,
      thumbnailKey: thumbnailUpload ? thumbnailUpload.key : undefined,
      thumbnailUrl: thumbnailUpload ? thumbnailUpload.url : undefined,
      duration,
      status: 'active',
      tags: parsedTags
    });
    
    await reel.save();
    
    // Cleanup temporary files
    const filesToCleanup = [videoPath];
    if (thumbnailPath) {
      filesToCleanup.push(thumbnailPath);
    }
    reelUploadService.cleanupTempFiles(filesToCleanup);
    
    return res.status(201).json({
      success: true,
      message: 'Reel uploaded successfully',
      reel
    });
  } catch (error) {
    console.error('Error uploading reel:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

module.exports = {
  uploadReelFixed
};
