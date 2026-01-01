const Landlord = require("../models/Landlord");
const Property = require("../models/Property");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { validationResult } = require("express-validator");
const idGenerator = require("../services/idGenerator");
const mongoose = require("mongoose");

// Register Landlord - Simplified without password or token
exports.registerLandlord = async (req, res) => {
  try {
    console.log("REGISTER LANDLORD REQUEST RECEIVED:", JSON.stringify(req.body));

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log("VALIDATION ERRORS:", errors.array());
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const {
      name,
      email,
      mobile,
      aadhaarNumber,
      address,
      pinCode,
      state,
      panNumber,
      dob,
      gender
    } = req.body;

    // Get profile photo path if uploaded
    const profilePhoto = req.file ? `/uploads/profiles/${req.file.filename}` : null;

    // Check if landlord already exists
    let landlord = await Landlord.findOne({
      $or: [
        { email },
        { mobile },
        { aadhaarNumber },
        { panNumber }
      ]
    });

    if (landlord) {
      return res.status(400).json({
        success: false,
        message: "Landlord already exists"
      });
    }

    landlord = new Landlord({
      name,
      email,
      mobile,
      aadhaarNumber,
      address,
      pinCode,
      state,
      panNumber,
      profilePhoto,
      dob: new Date(dob),
      gender,
    });

    await landlord.save();

    console.log("LANDLORD SAVED SUCCESSFULLY:", landlord.id);

    // Generate JWT token for the new landlord
    const payload = {
      id: landlord.id,
      role: 'landlord',
      email: landlord.email
    };

    // Use JWT_SECRET from environment or fallback to a default (for development only)
    const jwtSecret = process.env.JWT_SECRET || 'mysecretkey123';

    let tokenResult;
    try {
      const token = jwt.sign(
        payload,
        jwtSecret,
        { expiresIn: '30d' }
      );

      console.log("TOKEN GENERATED:", token);
      tokenResult = { token };
    } catch (err) {
      console.error("Error generating token:", err.message);
      tokenResult = { error: "Failed to generate authentication token" };
    }

    // Return success response with complete landlord info and token
    const response = {
      success: true,
      message: "Landlord registered successfully",
      token: tokenResult.token,
      landlord: {
        id: landlord.id,
        name: landlord.name,
        email: landlord.email,
        mobile: landlord.mobile,
        aadhaarNumber: landlord.aadhaarNumber,
        panNumber: landlord.panNumber,
        address: landlord.address,
        pinCode: landlord.pinCode,
        state: landlord.state,
        gender: landlord.gender,
        dob: landlord.dob,
        properties: landlord.properties || [],
        profilePhoto: landlord.profilePhoto || null,
        createdAt: landlord.createdAt
      }
    };

    console.log("SENDING RESPONSE:", JSON.stringify(response));
    res.status(201).json(response);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
};

// Find Landlord (replacing login with a simple lookup)
// exports.findLandlord = async (req, res) => {
//   try {
//     const errors = validationResult(req);
//     if (!errors.isEmpty()) {
//       return res.status(400).json({
//         success: false,
//         errors: errors.array()
//       });
//     }

//     const { email, mobile, aadhaarNumber, panNumber } = req.body;

//     // 🔎 Search condition
//     let searchQuery = {};
//     if (email) searchQuery.email = email;
//     else if (mobile) searchQuery.mobile = mobile;
//     else if (aadhaarNumber) searchQuery.aadhaarNumber = aadhaarNumber;
//     else if (panNumber) searchQuery.panNumber = panNumber;
//     else {
//       return res.status(400).json({
//         success: false,
//         message:
//           "At least one search parameter is required (email, mobile, aadhaarNumber, or panNumber)"
//       });
//     }

//     // ✅ Aggregation
//     const landlordData = await Landlord.aggregate([
//       { $match: searchQuery },

//       {
//         $lookup: {
//           from: "properties",
//           let: { landlordId: "$_id" },
//           pipeline: [
//             {
//               $match: {
//                 $expr: { $eq: ["$landlordId", "$$landlordId"] }
//               }
//             },
//             { $sort: { createdAt: -1 } }
//           ],
//           as: "properties"
//         }
//       },

//       { $limit: 1 }
//     ]);

//     // ❗ Aggregate returns array
//     if (!landlordData || landlordData.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "Landlord not found"
//       });
//     }

//     const landlord = landlordData[0];

//     // ✅ Response
//     res.json({
//       success: true,
//       landlord: {
//         id: landlord._id,
//         name: landlord.name,
//         email: landlord.email,
//         mobile: landlord.mobile,
//         aadhaarNumber: landlord.aadhaarNumber,
//         panNumber: landlord.panNumber,
//         address: landlord.address,
//         pinCode: landlord.pinCode,
//         state: landlord.state,
//         gender: landlord.gender,
//         dob: landlord.dob,
//         profilePhoto: landlord.profilePhoto || null,
//         properties: landlord.properties || [],
//         createdAt: landlord.createdAt
//       }
//     });

//   } catch (err) {
//     console.error(err);
//     res.status(500).send("Server Error");
//   }
// };

exports.findLandlord = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { email, mobile, aadhaarNumber, panNumber } = req.body;

    // 🔎 Search condition
    let searchQuery = {};
    if (email) searchQuery.email = email;
    else if (mobile) searchQuery.mobile = mobile;
    else if (aadhaarNumber) searchQuery.aadhaarNumber = aadhaarNumber;
    else if (panNumber) searchQuery.panNumber = panNumber;
    else {
      return res.status(400).json({
        success: false,
        message:
          "At least one search parameter is required (email, mobile, aadhaarNumber, or panNumber)"
      });
    }

    const landlordData = await Landlord.aggregate([
      { $match: searchQuery },

      // 🔹 Properties lookup
      {
        $lookup: {
          from: "properties",
          let: { landlordId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$landlordId", "$$landlordId"] }
              }
            },
            { $sort: { createdAt: -1 } }
          ],
          as: "properties"
        }
      },

      // 🔹 Subscriptions lookup
      {
        $lookup: {
          from: "subscriptions",
          let: { landlordId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$landlordId", "$$landlordId"] }
              }
            },
            { $sort: { createdAt: -1 } },
            { $limit: 1 } // latest subscription only
          ],
          as: "subscription"
        }
      },

      // 🔹 Subscription status flag
      {
        $addFields: {
          hasSubscription: {
            $cond: {
              if: { $gt: [{ $size: "$subscription" }, 0] },
              then: true,
              else: false
            }
          },
          subscription: {
            $arrayElemAt: ["$subscription", 0]
          }
        }
      },

      { $limit: 1 }
    ]);

    if (!landlordData || landlordData.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Landlord not found"
      });
    }

    const landlord = landlordData[0];

    // ✅ Final Response
    res.json({
      success: true,
      landlord: {
        id: landlord._id,
        name: landlord.name,
        email: landlord.email,
        mobile: landlord.mobile,
        aadhaarNumber: landlord.aadhaarNumber,
        panNumber: landlord.panNumber,
        address: landlord.address,
        pinCode: landlord.pinCode,
        state: landlord.state,
        gender: landlord.gender,
        dob: landlord.dob,
        profilePhoto: landlord.profilePhoto || null,

        properties: landlord.properties || [],

        hasSubscription: landlord.hasSubscription,
        subscription: landlord.hasSubscription
          ? landlord.subscription
          : "No active subscription",

        createdAt: landlord.createdAt
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};


// Get Landlord Info
exports.getLandlordInfo = async (req, res) => {
  try {
    const landlord = await Landlord.findById(req.user.id).select("-password");
    res.json(landlord);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
};

// Update Landlord Info
exports.updateLandlordInfo = async (req, res) => {
  try {
    const {
      name,
      email,
      mobile,
      aadhaarNumber,
      address,
      pinCode,
      state,
      panNumber,
      dob,
      gender
    } = req.body;

    // Build update object
    const updateFields = {};
    if (name) updateFields.name = name;
    if (email) updateFields.email = email;
    if (mobile) updateFields.mobile = mobile;
    if (aadhaarNumber) updateFields.aadhaarNumber = aadhaarNumber;
    if (address) updateFields.address = address;
    if (pinCode) updateFields.pinCode = pinCode;
    if (state) updateFields.state = state;
    if (panNumber) updateFields.panNumber = panNumber;
    if (dob) updateFields.dob = new Date(dob);
    if (gender) updateFields.gender = gender;

    // Add profile photo if uploaded
    if (req.file) {
      updateFields.profilePhoto = `/uploads/profiles/${req.file.filename}`;
    }

    // Update landlord
    const landlord = await Landlord.findByIdAndUpdate(
      req.user.id,
      { $set: updateFields },
      { new: true }
    ).select("-password");

    res.json({
      success: true,
      message: "Profile updated successfully",
      landlord: {
        id: landlord.id,
        name: landlord.name,
        email: landlord.email,
        mobile: landlord.mobile,
        aadhaarNumber: landlord.aadhaarNumber,
        panNumber: landlord.panNumber,
        address: landlord.address,
        pinCode: landlord.pinCode,
        state: landlord.state,
        gender: landlord.gender,
        dob: landlord.dob,
        properties: landlord.properties || [],
        profilePhoto: landlord.profilePhoto || null,
        createdAt: landlord.createdAt
      }
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message
    });
  }
};

// Get Landlord Profile (used in routes)
exports.getLandlordProfile = async (req, res) => {
  try {
    const landlord = await Landlord.findById(req.user.id).select("-password");
    res.json({
      success: true,
      landlord
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      success: false,
      message: "Server Error"
    });
  }
};

const s3Upload = require('../utils/s3Upload');

// Add a new property
exports.addProperty = async (req, res) => {
  try {
    const {
      name,
      address,
      type,
      totalRooms,
      totalBeds,
      city,
      state,
      pinCode,
      landmark,
      contactNumber,
      description,
      amenities,
      rooms
    } = req.body;

    // Generate standardized property ID using idGenerator service
    const propertyId = await idGenerator.generatePropertyId();

    // Create new property object
    const newProperty = new Property({
      propertyId,
      name,
      address,
      type,
      totalRooms,
      totalBeds,
      city,
      state,
      pinCode,
      landmark,
      contactNumber,
      description,
      amenities,
      landlordId: req.user.id
    });

    // If rooms details provided, add them to the property
    let totalBedsCount = 0;
    if (rooms && Array.isArray(rooms) && rooms.length > 0) {
      newProperty.rooms = rooms.map((roomData, roomIndex) => {
        const roomId = `${propertyId}-R${roomIndex + 1}`;

        const room = {
          roomId,
          name: roomData.name || `Room ${roomIndex + 1}`,
          type: roomData.roomType || roomData.type || 'PG',
          status: 'Available',
          price: roomData.price || 0,
          capacity: roomData.capacity || 1,
          facilities: roomData.facilities || {}
        };

        // If beds details provided, add them to the room
        if (roomData.beds && Array.isArray(roomData.beds) && roomData.beds.length > 0) {
          room.beds = roomData.beds.map((bedData, bedIndex) => {
            const bedId = `${roomId}-B${bedIndex + 1}`;
            totalBedsCount++;

            return {
              bedId,
              name: bedData.name || `Bed ${bedIndex + 1}`,
              status: 'Available',
              price: bedData.price || 0
            };
          });
        }

        return room;
      });
    }

    // Update the totalBeds count
    if (totalBedsCount > 0) {
      newProperty.totalBeds = totalBedsCount;
    }

    // Handle image uploads to S3
    if (req.files && req.files.length > 0) {
      // Limit to 10 files
      const filesToUpload = req.files.slice(0, 10);

      try {
        // Upload files to S3 in landlord/property directory
        const s3Directory = `landlord-property/${req.user.id}/${propertyId}`;
        const uploadedFiles = await s3Upload.uploadMultipleFiles(filesToUpload, s3Directory);

        // Store image URLs in the property
        newProperty.images = uploadedFiles.map(file => file.url);
      } catch (uploadError) {
        console.error('Error uploading images to S3:', uploadError);
        return res.status(500).json({
          success: false,
          message: "Error uploading property images",
          error: uploadError.message
        });
      }
    }

    await newProperty.save();

    res.status(201).json({
      success: true,
      message: "Property added successfully",
      property: newProperty
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message
    });
  }
};

// Get all properties for a landlord
exports.getProperties = async (req, res) => {
  try {
    const properties = await Property.find({ landlordId: req.user.id });
    res.json({
      success: true,
      count: properties.length,
      properties
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      success: false,
      message: "Server Error"
    });
  }
};

// Get property by ID
exports.getPropertyById = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);

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

    res.json({
      success: true,
      property
    });
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

// Update property
exports.updateProperty = async (req, res) => {
  try {
    const {
      name,
      address,
      type,
      totalRooms,
      totalBeds,
      city,
      state,
      pinCode,
      landmark,
      contactNumber,
      description,
      amenities,
      rooms,
      images,
      latitude,
      longitude,
      propertyId: propertyIdFromBody // Allow lookup by propertyId as well
    } = req.body;

    // Find property by ID or propertyId
    let property;
    if (req.params.id) {
      // Find by route parameter ID
      property = await Property.findById(req.params.id);
    } else if (propertyIdFromBody) {
      // Find by propertyId in request body
      property = await Property.findOne({
        $or: [
          { _id: propertyIdFromBody },
          { propertyId: propertyIdFromBody }
        ]
      });
    } else {
      return res.status(400).json({
        success: false,
        message: "Property ID is required"
      });
    }

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

    // Build update object with all possible fields
    const updateFields = {};
    if (name) updateFields.name = name;
    if (address) updateFields.address = address;
    if (type) updateFields.type = type;
    if (totalRooms !== undefined) updateFields.totalRooms = totalRooms;
    if (totalBeds !== undefined) updateFields.totalBeds = totalBeds;
    if (city) updateFields.city = city;
    if (state) updateFields.state = state;
    if (pinCode) updateFields.pinCode = pinCode;
    if (landmark) updateFields.landmark = landmark;
    if (contactNumber) updateFields.contactNumber = contactNumber;
    if (description) updateFields.description = description;
    if (amenities) updateFields.amenities = amenities;
    if (images) updateFields.images = images;
    if (latitude !== undefined) updateFields.latitude = latitude;
    if (longitude !== undefined) updateFields.longitude = longitude;

    // Handle room updates if provided
    if (rooms && Array.isArray(rooms)) {
      // Process and update rooms
      let totalBedsCount = 0;

      // Check if we're replacing all rooms or adding new ones
      if (req.query.replaceRooms === 'true') {
        // Replace all rooms
        updateFields.rooms = rooms.map((roomData, roomIndex) => {
          const roomId = roomData.roomId || `${property.propertyId}-R${roomIndex + 1}`;

          const room = {
            roomId,
            name: roomData.name || `Room ${roomIndex + 1}`,
            type: roomData.roomType || roomData.type || 'PG',
            status: roomData.status || 'Available',
            price: roomData.price || 0,
            capacity: roomData.capacity || 1,
            facilities: roomData.facilities || {},
            monthlyCollection: roomData.monthlyCollection || 0,
            pendingDues: roomData.pendingDues || 0
          };

          // Handle beds if provided
          if (roomData.beds && Array.isArray(roomData.beds)) {
            room.beds = roomData.beds.map((bedData, bedIndex) => {
              const bedId = bedData.bedId || `${roomId}-B${bedIndex + 1}`;
              totalBedsCount++;

              return {
                bedId,
                name: bedData.name || `Bed ${bedIndex + 1}`,
                status: bedData.status || 'Available',
                price: bedData.price || 0,
                monthlyCollection: bedData.monthlyCollection || 0,
                pendingDues: bedData.pendingDues || 0,
                tenants: bedData.tenants || []
              };
            });
          }

          return room;
        });

        // Update the total beds count
        if (totalBedsCount > 0) {
          updateFields.totalBeds = totalBedsCount;
        }
      } else {
        // Update existing rooms or add new ones
        const existingRooms = [...property.rooms];

        rooms.forEach(roomData => {
          if (roomData.roomId) {
            // Update existing room
            const existingRoomIndex = existingRooms.findIndex(r => r.roomId === roomData.roomId);

            if (existingRoomIndex >= 0) {
              // Update existing room properties
              const existingRoom = existingRooms[existingRoomIndex];

              if (roomData.name) existingRoom.name = roomData.name;
              if (roomData.type) existingRoom.type = roomData.type;
              if (roomData.status) existingRoom.status = roomData.status;
              if (roomData.price) existingRoom.price = roomData.price;
              if (roomData.capacity) existingRoom.capacity = roomData.capacity;

              // Update facilities if provided
              if (roomData.facilities) {
                if (!existingRoom.facilities) existingRoom.facilities = {};

                // Update each facility category
                Object.keys(roomData.facilities).forEach(category => {
                  if (!existingRoom.facilities[category]) {
                    existingRoom.facilities[category] = {};
                  }

                  Object.assign(existingRoom.facilities[category], roomData.facilities[category]);
                });
              }

              // Update beds if provided
              if (roomData.beds && Array.isArray(roomData.beds)) {
                if (!existingRoom.beds) existingRoom.beds = [];

                roomData.beds.forEach(bedData => {
                  if (bedData.bedId) {
                    // Update existing bed
                    const existingBedIndex = existingRoom.beds.findIndex(b => b.bedId === bedData.bedId);

                    if (existingBedIndex >= 0) {
                      // Update bed properties
                      Object.assign(existingRoom.beds[existingBedIndex], bedData);
                    } else {
                      // Add new bed
                      existingRoom.beds.push({
                        bedId: bedData.bedId,
                        name: bedData.name || `New Bed`,
                        status: bedData.status || 'Available',
                        price: bedData.price || 0,
                        monthlyCollection: bedData.monthlyCollection || 0,
                        pendingDues: bedData.pendingDues || 0,
                        tenants: bedData.tenants || []
                      });
                      totalBedsCount++;
                    }
                  } else {
                    // Add new bed with generated ID
                    const bedId = `${existingRoom.roomId}-B${existingRoom.beds.length + 1}`;
                    existingRoom.beds.push({
                      bedId,
                      name: bedData.name || `Bed ${existingRoom.beds.length + 1}`,
                      status: bedData.status || 'Available',
                      price: bedData.price || 0,
                      monthlyCollection: bedData.monthlyCollection || 0,
                      pendingDues: bedData.pendingDues || 0,
                      tenants: bedData.tenants || []
                    });
                    totalBedsCount++;
                  }
                });
              }
            } else {
              // Room ID provided but not found - add as new room
              const room = {
                roomId: roomData.roomId,
                name: roomData.name || `Room ${existingRooms.length + 1}`,
                type: roomData.type || 'PG',
                status: roomData.status || 'Available',
                price: roomData.price || 0,
                capacity: roomData.capacity || 1,
                facilities: roomData.facilities || {},
                monthlyCollection: roomData.monthlyCollection || 0,
                pendingDues: roomData.pendingDues || 0,
                beds: []
              };

              // Add beds if provided
              if (roomData.beds && Array.isArray(roomData.beds)) {
                room.beds = roomData.beds.map((bedData, bedIndex) => {
                  const bedId = bedData.bedId || `${room.roomId}-B${bedIndex + 1}`;
                  totalBedsCount++;

                  return {
                    bedId,
                    name: bedData.name || `Bed ${bedIndex + 1}`,
                    status: bedData.status || 'Available',
                    price: bedData.price || 0,
                    monthlyCollection: bedData.monthlyCollection || 0,
                    pendingDues: bedData.pendingDues || 0,
                    tenants: bedData.tenants || []
                  };
                });
              }

              existingRooms.push(room);
            }
          } else {
            // Add new room with generated ID
            const roomId = `${property.propertyId}-R${existingRooms.length + 1}`;
            const room = {
              roomId,
              name: roomData.name || `Room ${existingRooms.length + 1}`,
              type: roomData.type || 'PG',
              status: roomData.status || 'Available',
              price: roomData.price || 0,
              capacity: roomData.capacity || 1,
              facilities: roomData.facilities || {},
              monthlyCollection: roomData.monthlyCollection || 0,
              pendingDues: roomData.pendingDues || 0,
              beds: []
            };

            // Add beds if provided
            if (roomData.beds && Array.isArray(roomData.beds)) {
              room.beds = roomData.beds.map((bedData, bedIndex) => {
                const bedId = bedData.bedId || `${roomId}-B${bedIndex + 1}`;
                totalBedsCount++;

                return {
                  bedId,
                  name: bedData.name || `Bed ${bedIndex + 1}`,
                  status: bedData.status || 'Available',
                  price: bedData.price || 0,
                  monthlyCollection: bedData.monthlyCollection || 0,
                  pendingDues: bedData.pendingDues || 0,
                  tenants: bedData.tenants || []
                };
              });
            }

            existingRooms.push(room);
          }
        });

        // Update the rooms array
        updateFields.rooms = existingRooms;

        // Update total beds count if needed
        if (totalBedsCount > 0) {
          // Count total beds in all rooms
          const totalBeds = existingRooms.reduce((total, room) => {
            return total + (room.beds ? room.beds.length : 0);
          }, 0);

          updateFields.totalBeds = totalBeds;
        }
      }
    }

    // Note: Image uploads are now handled by a separate endpoint
    // We still support the images array in the JSON payload for backwards compatibility
    if (req.body.images && Array.isArray(req.body.images)) {
      // If images are provided in the JSON, use them (limited to 10)
      if (req.body.images.length > 10) {
        updateFields.images = req.body.images.slice(0, 10);
      } else {
        updateFields.images = req.body.images;
      }
    }

    // Handle image deletions if requested
    if (req.body.deleteImages && Array.isArray(req.body.deleteImages) && property.images) {
      const imagesToDelete = property.images.filter(url => req.body.deleteImages.includes(url));

      if (imagesToDelete.length > 0) {
        const keysToDelete = imagesToDelete.map(url => {
          // Extract the key from the URL
          const urlParts = url.split('/');
          return urlParts.slice(3).join('/'); // Remove https://bucket.s3.region.amazonaws.com/
        });

        try {
          await s3Upload.deleteMultipleFiles(keysToDelete);
        } catch (deleteError) {
          console.error('Error deleting images from S3:', deleteError);
        }

        // Update the images array to remove deleted images
        if (!updateFields.images) {
          updateFields.images = property.images.filter(url => !req.body.deleteImages.includes(url));
        } else {
          updateFields.images = updateFields.images.filter(url => !req.body.deleteImages.includes(url));
        }
      }
    }

    // Update property
    const propertyObjectId = property._id;
    property = await Property.findByIdAndUpdate(
      propertyObjectId,
      { $set: updateFields },
      { new: true }
    );

    res.json({
      success: true,
      property
    });
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

// Delete property
exports.deleteProperty = async (req, res) => {
  try {
    // Find property
    const property = await Property.findById(req.params.id);

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

    // Delete property images from S3 if they exist
    if (property.images && property.images.length > 0) {
      const keysToDelete = property.images.map(url => {
        // Extract the key from the URL
        const urlParts = url.split('/');
        return urlParts.slice(3).join('/'); // Remove https://bucket.s3.region.amazonaws.com/
      });

      try {
        await s3Upload.deleteMultipleFiles(keysToDelete);
      } catch (deleteError) {
        console.error('Error deleting property images from S3:', deleteError);
        // Continue with deletion even if image deletion fails
      }
    }

    // Delete property
    await Property.findByIdAndDelete(property._id);

    res.json({
      success: true,
      message: "Property deleted successfully"
    });
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

// Upload property images separately
exports.uploadPropertyImages = async (req, res) => {
  try {
    const propertyId = req.params.id || req.body.propertyId;

    if (!propertyId) {
      return res.status(400).json({
        success: false,
        message: "Property ID is required"
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

    // Handle image uploads
    if (req.files && req.files.length > 0) {
      // Check current image count
      const currentImageCount = property.images ? property.images.length : 0;
      const maxNewImages = 10 - currentImageCount;

      if (maxNewImages <= 0) {
        return res.status(400).json({
          success: false,
          message: "Maximum of 10 images per property allowed. Please delete some images first."
        });
      }

      const filesToUpload = req.files.slice(0, maxNewImages);

      try {
        // Upload files to S3 in landlord/property directory
        const s3Directory = `landlord-property/${req.user.id}/${property.propertyId}`;
        const uploadedFiles = await s3Upload.uploadMultipleFiles(filesToUpload, s3Directory);

        // Prepare update for images array
        const updatedImages = [
          ...(property.images || []),
          ...uploadedFiles.map(file => file.url)
        ];

        // If exceeds 10 images, trim to only keep 10
        if (updatedImages.length > 10) {
          // We need to delete the extra images from S3
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

        // Update property with new images
        property = await Property.findByIdAndUpdate(
          property._id,
          { $set: { images: updatedImages } },
          { new: true }
        );

        res.json({
          success: true,
          property
        });
      } catch (uploadError) {
        console.error('Error uploading images to S3:', uploadError);
        return res.status(500).json({
          success: false,
          message: "Error uploading property images",
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
