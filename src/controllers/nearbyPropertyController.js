const Property = require('../models/Property');
const { setCache, getCache } = require('../utils/redis');
const { 
  calculateDistance, 
  getLocationFromCoordinates, 
  getCoordinatesFromAddress 
} = require('../utils/locationUtils');

/**
 * Find nearby properties based on user's coordinates
 * Supports both default radius and custom radius
 */
const findNearbyProperties = async (req, res) => {
  try {
    // Get parameters from request
    const { lat, lng, radius = 5, type, minRent, maxRent, sortBy = 'distance', page = 1, limit = 20 } = req.query;
    
    // Validate latitude and longitude
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const searchRadius = parseFloat(radius);
    
    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({
        success: false,
        message: 'Valid latitude and longitude are required'
      });
    }
    
    if (isNaN(searchRadius) || searchRadius <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Radius must be a positive number'
      });
    }

    // Try to get location information
    const locationInfo = await getLocationFromCoordinates(latitude, longitude);
    let locationData = {
      formatted_address: locationInfo?.formatted_address || "Unknown location",
      components: locationInfo?.components || {}
    };
    
    // Build query with filters
    const query = { isActive: true };
    
    // Add property type filter if provided
    if (type && type !== 'all') {
      query.type = type;
    }
    
    // Check if we can use geospatial query (if location field is indexed)
    let useGeospatial = false;
    try {
      // Check if the collection has a 2dsphere index on location
      const indexes = await Property.collection.indexes();
      useGeospatial = indexes.some(index => 
        index.key && index.key.location === '2dsphere'
      );
    } catch (err) {
      useGeospatial = false;
    }
    
    let nearbyProperties = [];
    let totalCount = 0;
    let executionTime = Date.now();
    
    if (useGeospatial) {
      try {
        // Use geospatial query for better performance
        // Using $geoWithin with $centerSphere instead of $nearSphere to avoid sorting issues
        const geoQuery = {
          ...query,
          location: {
            $geoWithin: {
              $centerSphere: [
                [longitude, latitude], // GeoJSON uses [longitude, latitude] order
                searchRadius / 6371 // Convert km to radians (Earth radius is ~6371 km)
              ]
            }
          }
        };
        
        // Add price range filters if provided
        if (minRent || maxRent) {
          // Price filter strategy: Since prices are stored at the room level,
          // we need a different approach than direct filtering
          // This is a limitation of the current data model
          console.log(`Price filter requested: min=${minRent}, max=${maxRent}`);
        }
        
        // Count total matching properties
        totalCount = await Property.countDocuments(geoQuery);
        console.log(`Found ${totalCount} properties within ${searchRadius}km radius using geospatial query`);
        
        // Get all properties matching the geospatial query
        nearbyProperties = await Property.find(geoQuery).lean();
        
        // Calculate distance for each property
        nearbyProperties = nearbyProperties.map(property => {
          const distance = calculateDistance(
            latitude,
            longitude,
            property.latitude || 0,
            property.longitude || 0
          );
          
          return {
            ...property,
            distance
          };
        });
        
        // Sort manually since $geoWithin doesn't sort by distance
        if (sortBy === 'price_asc') {
          // Sort by minimum room price (ascending)
          nearbyProperties.sort((a, b) => {
            const aMinPrice = a.rooms.length > 0 ? Math.min(...a.rooms.map(r => r.price || 0)) : Infinity;
            const bMinPrice = b.rooms.length > 0 ? Math.min(...b.rooms.map(r => r.price || 0)) : Infinity;
            return aMinPrice - bMinPrice;
          });
        } else if (sortBy === 'price_desc') {
          // Sort by minimum room price (descending)
          nearbyProperties.sort((a, b) => {
            const aMinPrice = a.rooms.length > 0 ? Math.min(...a.rooms.map(r => r.price || 0)) : 0;
            const bMinPrice = b.rooms.length > 0 ? Math.min(...b.rooms.map(r => r.price || 0)) : 0;
            return bMinPrice - aMinPrice;
          });
        } else {
          // Default sort by distance (closest first)
          nearbyProperties.sort((a, b) => a.distance - b.distance);
        }
        
        // Apply pagination after sorting
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const limitNum = parseInt(limit);
        nearbyProperties = nearbyProperties.slice(skip, skip + limitNum);
      } catch (error) {
        console.error('Error using geospatial query:', error);
        console.log('Falling back to manual distance calculation');
        
        // Reset the variables and try the manual approach
        useGeospatial = false;
        nearbyProperties = [];
        totalCount = 0;
      }
    }
    
    if (!useGeospatial) {
      // Fallback to manual filtering
      // Get all active properties
      const allProperties = await Property.find(query).lean();
      
      console.log(`Found ${allProperties.length} active properties in the database`);
      
      // Filter properties by distance
      nearbyProperties = allProperties.filter(property => {
        // Skip properties without coordinates
        if (!property.latitude || !property.longitude) {
          return false;
        }
        
        const distance = calculateDistance(
          latitude,
          longitude,
          property.latitude,
          property.longitude
        );
        
        // Add distance to property object for sorting
        property.distance = distance;
        
        return distance <= searchRadius;
      });
      
      // Apply pagination after filtering
      totalCount = nearbyProperties.length;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const limitNum = parseInt(limit);
      
      // Sort before pagination
      if (sortBy === 'price_asc') {
        // Sort by minimum room price (ascending)
        nearbyProperties.sort((a, b) => {
          const aMinPrice = a.rooms.length > 0 ? Math.min(...a.rooms.map(r => r.price || 0)) : Infinity;
          const bMinPrice = b.rooms.length > 0 ? Math.min(...b.rooms.map(r => r.price || 0)) : Infinity;
          return aMinPrice - bMinPrice;
        });
      } else if (sortBy === 'price_desc') {
        // Sort by minimum room price (descending)
        nearbyProperties.sort((a, b) => {
          const aMinPrice = a.rooms.length > 0 ? Math.min(...a.rooms.map(r => r.price || 0)) : 0;
          const bMinPrice = b.rooms.length > 0 ? Math.min(...b.rooms.map(r => r.price || 0)) : 0;
          return bMinPrice - aMinPrice;
        });
      } else {
        // Default sort by distance (closest first)
        nearbyProperties.sort((a, b) => a.distance - b.distance);
      }
      
      // Apply pagination
      nearbyProperties = nearbyProperties.slice(skip, skip + limitNum);
    }
    
    executionTime = Date.now() - executionTime;
    console.log(`Query execution time: ${executionTime}ms`);
    console.log(`Found ${totalCount} properties within ${searchRadius}km radius`);
    
    // Format properties for response
    const formattedProperties = nearbyProperties.map(property => {
      // Get minimum room price
      const roomPrices = property.rooms.map(room => room.price).filter(p => p && p > 0);
      const minRoomPrice = roomPrices.length > 0 ? Math.min(...roomPrices) : 0;
      
      // Get availability status
      const availableRooms = property.rooms.filter(room => room.status === 'Available').length;
      
      // Get room types
      const roomTypes = [...new Set(property.rooms.map(room => room.type))];
      
      return {
        id: property._id,
        propertyId: property.propertyId,
        name: property.name,
        type: property.type,
        address: property.address,
        city: property.city,
        state: property.state,
        distance: parseFloat(property.distance.toFixed(2)), // Distance in km (rounded to 2 decimal places)
        distanceText: `${property.distance.toFixed(2)} km away`,
        walkTime: `${Math.round(property.distance * 15)} mins walk`, // Approx. 15 min per km
        driveTime: `${Math.round(property.distance * 3)} mins drive`, // Approx. 3 min per km
        totalRooms: property.totalRooms,
        availableRooms: availableRooms,
        minPrice: minRoomPrice,
        priceRange: `₹${minRoomPrice}${roomPrices.length > 1 ? ' - ₹' + Math.max(...roomPrices) : ''}`,
        images: property.images && property.images.length > 0 ? [property.images[0]] : [],
        roomTypes: roomTypes,
        latitude: property.latitude,
        longitude: property.longitude
      };
    });
    
    // Create statistics for response
    const propertyTypeCount = {};
    nearbyProperties.forEach(property => {
      if (!propertyTypeCount[property.type]) {
        propertyTypeCount[property.type] = 0;
      }
      propertyTypeCount[property.type]++;
    });

    // Include debug info if requested or in development
    const includeDebug = req.query.debug === 'true' || process.env.NODE_ENV === 'development';
    const debugInfo = includeDebug ? {
      useGeospatialQuery: useGeospatial,
      executionTimeMs: executionTime,
      searchParameters: { latitude, longitude, searchRadius },
      query: query
    } : undefined;

    res.status(200).json({
      success: true,
      location: locationData,
      radius: searchRadius,
      totalProperties: totalCount,
      propertyTypeCount,
      properties: formattedProperties,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalCount / parseInt(limit))
      },
      debug: debugInfo
    });
  } catch (error) {
    console.error('Error in findNearbyProperties:', error);
    console.error('Full error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Error finding nearby properties', 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Find nearby properties by property type
 */
const findNearbyPropertiesByType = async (req, res) => {
  try {
    // Get parameters from request
    const { lat, lng, radius = 5, type } = req.query;
    
    // Validate latitude and longitude
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const searchRadius = parseFloat(radius);
    
    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({
        success: false,
        message: 'Valid latitude and longitude are required'
      });
    }
    
    if (!type) {
      return res.status(400).json({
        success: false,
        message: 'Property type is required'
      });
    }

    // Get all properties of the specified type
    const allProperties = await Property.find({ 
      isActive: true,
      type: type 
    });
    
    // Count properties with coordinates
    const propertiesWithCoordinates = allProperties.filter(p => p.latitude && p.longitude).length;
    
    // Filter properties by distance
    const nearbyProperties = [];
    
    for (const property of allProperties) {
      // Skip properties without coordinates
      if (!property.latitude || !property.longitude) {
        continue;
      }
      
      const distance = calculateDistance(
        latitude, 
        longitude, 
        property.latitude, 
        property.longitude
      );
      
      // Add distance to property object for sorting
      property.distance = distance;
      
      if (distance <= searchRadius) {
        nearbyProperties.push(property);
      }
    }


    
    // Sort properties by distance (closest first)
    nearbyProperties.sort((a, b) => a.distance - b.distance);
    
    // Format properties for response
    const formattedProperties = nearbyProperties.map(property => {
      // Get minimum room price
      const roomPrices = property.rooms.map(room => room.price);
      const minRoomPrice = roomPrices.length > 0 ? Math.min(...roomPrices) : 0;
      
      // Get availability status
      const availableRooms = property.rooms.filter(room => room.status === 'Available').length;
      
      return {
        id: property._id,
        propertyId: property.propertyId,
        name: property.name,
        type: property.type,
        address: property.address,
        city: property.city,
        state: property.state,
        distance: parseFloat(property.distance.toFixed(2)),
        totalRooms: property.totalRooms,
        availableRooms: availableRooms,
        minPrice: minRoomPrice,
        images: property.images && property.images.length > 0 ? [property.images[0]] : [],
        latitude: property.latitude,
        longitude: property.longitude
      };
    });

    // Include debug info if requested or in development
    const includeDebug = req.query.debug === 'true' || process.env.NODE_ENV === 'development';
    const debugInfo = includeDebug ? {
      totalPropertiesOfType: allProperties.length,
      propertiesWithCoordinates,
      searchParameters: { latitude, longitude, searchRadius, type }
    } : undefined;

    res.status(200).json({
      success: true,
      propertyType: type,
      radius: searchRadius,
      totalProperties: formattedProperties.length,
      properties: formattedProperties,
      debug: debugInfo
    });
  } catch (error) {
    console.error('Error in findNearbyPropertiesByType:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error finding nearby properties by type', 
      error: error.message 
    });
  }
};

/**
 * Find nearby properties based on address
 */
const findNearbyPropertiesByAddress = async (req, res) => {
  try {
    // Get parameters from request
    const { address, radius = 5, type, minRent, maxRent, sortBy = 'distance', page = 1, limit = 20 } = req.query;
    
    if (!address) {
      return res.status(400).json({
        success: false,
        message: 'Address is required'
      });
    }
    
    const searchRadius = parseFloat(radius);
    if (isNaN(searchRadius) || searchRadius <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Radius must be a positive number'
      });
    }
    
    // Get coordinates from the provided address
    const locationData = await getCoordinatesFromAddress(address);
    
    if (!locationData || !locationData.lat || !locationData.lng) {
      return res.status(404).json({
        success: false,
        message: 'Could not determine coordinates for the provided address'
      });
    }
    
    // Extract coordinates
    const latitude = locationData.lat;
    const longitude = locationData.lng;
    
    // Query to find properties
    let query = { isActive: true };
    
    // Add type filter if provided
    if (type && type !== 'all') {
      query.type = type;
      console.log(`Filtering by property type: ${type}`);
    }
    
    // Check if we can use geospatial query
    let useGeospatial = false;
    try {
      // Check if the collection has a 2dsphere index on location
      const indexes = await Property.collection.indexes();
      useGeospatial = indexes.some(index => 
        index.key && index.key.location === '2dsphere'
      );
      
      if (useGeospatial) {
        console.log('Using geospatial query for better performance');
      } else {
        console.log('Geospatial index not found, using manual distance calculation');
      }
    } catch (err) {
      console.log('Error checking indexes, falling back to manual calculation:', err.message);
      useGeospatial = false;
    }
    
    let nearbyProperties = [];
    let totalCount = 0;
    let executionTime = Date.now();
    
    if (useGeospatial) {
      try {
        // Use geospatial query for better performance
        // Using $geoWithin with $centerSphere instead of $nearSphere to avoid sorting issues
        const geoQuery = {
          ...query,
          location: {
            $geoWithin: {
              $centerSphere: [
                [longitude, latitude], // GeoJSON uses [longitude, latitude] order
                searchRadius / 6371 // Convert km to radians (Earth radius is ~6371 km)
              ]
            }
          }
        };
        
        // Count total matching properties
        totalCount = await Property.countDocuments(geoQuery);
        console.log(`Found ${totalCount} properties within ${searchRadius}km radius using geospatial query`);
        
        // Get all properties matching the geospatial query
        nearbyProperties = await Property.find(geoQuery).lean();
        
        // Calculate distance for each property
        nearbyProperties = nearbyProperties.map(property => {
          const distance = calculateDistance(
            latitude,
            longitude,
            property.latitude || 0,
            property.longitude || 0
          );
          
          return {
            ...property,
            distance
          };
        });
        
        // Sort manually since $geoWithin doesn't sort by distance
        if (sortBy === 'price_asc') {
          // Sort by minimum room price (ascending)
          nearbyProperties.sort((a, b) => {
            const aMinPrice = a.rooms.length > 0 ? Math.min(...a.rooms.map(r => r.price || 0)) : Infinity;
            const bMinPrice = b.rooms.length > 0 ? Math.min(...b.rooms.map(r => r.price || 0)) : Infinity;
            return aMinPrice - bMinPrice;
          });
        } else if (sortBy === 'price_desc') {
          // Sort by minimum room price (descending)
          nearbyProperties.sort((a, b) => {
            const aMinPrice = a.rooms.length > 0 ? Math.min(...a.rooms.map(r => r.price || 0)) : 0;
            const bMinPrice = b.rooms.length > 0 ? Math.min(...b.rooms.map(r => r.price || 0)) : 0;
            return bMinPrice - aMinPrice;
          });
        } else {
          // Default sort by distance (closest first)
          nearbyProperties.sort((a, b) => a.distance - b.distance);
        }
        
        // Apply pagination after sorting
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const limitNum = parseInt(limit);
        nearbyProperties = nearbyProperties.slice(skip, skip + limitNum);
      } catch (error) {
        console.error('Error using geospatial query:', error);
        console.log('Falling back to manual distance calculation');
        
        // Reset the variables and try the manual approach
        useGeospatial = false;
        nearbyProperties = [];
        totalCount = 0;
      }
    }
    
    if (!useGeospatial) {
      // Fallback to manual filtering
      // Get all active properties
      const allProperties = await Property.find(query).lean();
      console.log(`Found ${allProperties.length} properties matching initial query`);
      
      // Filter properties by distance
      nearbyProperties = allProperties.filter(property => {
        // Skip properties without coordinates
        if (!property.latitude || !property.longitude) {
          return false;
        }
        
        const distance = calculateDistance(
          latitude,
          longitude,
          property.latitude,
          property.longitude
        );
        
        // Add distance to property object for sorting
        property.distance = distance;
        
        return distance <= searchRadius;
      });
      
      // Apply pagination after filtering
      totalCount = nearbyProperties.length;
      
      // Sort before pagination
      if (sortBy === 'price_asc') {
        // Sort by minimum room price (ascending)
        nearbyProperties.sort((a, b) => {
          const aMinPrice = a.rooms.length > 0 ? Math.min(...a.rooms.map(r => r.price || 0)) : Infinity;
          const bMinPrice = b.rooms.length > 0 ? Math.min(...b.rooms.map(r => r.price || 0)) : Infinity;
          return aMinPrice - bMinPrice;
        });
      } else if (sortBy === 'price_desc') {
        // Sort by minimum room price (descending)
        nearbyProperties.sort((a, b) => {
          const aMinPrice = a.rooms.length > 0 ? Math.min(...a.rooms.map(r => r.price || 0)) : 0;
          const bMinPrice = b.rooms.length > 0 ? Math.min(...b.rooms.map(r => r.price || 0)) : 0;
          return bMinPrice - aMinPrice;
        });
      } else {
        // Default sort by distance (closest first)
        nearbyProperties.sort((a, b) => a.distance - b.distance);
      }
      
      // Apply pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const limitNum = parseInt(limit);
      nearbyProperties = nearbyProperties.slice(skip, skip + limitNum);
    }
    
    executionTime = Date.now() - executionTime;
    console.log(`Query execution time: ${executionTime}ms`);
    console.log(`Found ${totalCount} properties within ${searchRadius}km radius of the address`);
    
    // Format properties for response
    const formattedProperties = nearbyProperties.map(property => {
      // Get minimum room price
      const roomPrices = property.rooms.map(room => room.price).filter(p => p && p > 0);
      const minRoomPrice = roomPrices.length > 0 ? Math.min(...roomPrices) : 0;
      const maxRoomPrice = roomPrices.length > 0 ? Math.max(...roomPrices) : 0;
      
      // Get availability status
      const availableRooms = property.rooms.filter(room => room.status === 'Available').length;
      
      // Get room types
      const roomTypes = [...new Set(property.rooms.map(room => room.type))];
      
      return {
        id: property._id,
        propertyId: property.propertyId,
        name: property.name,
        type: property.type,
        address: property.address,
        city: property.city,
        state: property.state,
        distance: parseFloat(property.distance.toFixed(2)), // Distance in km (rounded to 2 decimal places)
        distanceText: `${property.distance.toFixed(2)} km away`,
        walkTime: `${Math.round(property.distance * 15)} mins walk`, // Approx. 15 min per km
        driveTime: `${Math.round(property.distance * 3)} mins drive`, // Approx. 3 min per km
        totalRooms: property.totalRooms,
        availableRooms: availableRooms,
        minPrice: minRoomPrice,
        maxPrice: maxRoomPrice,
        priceRange: `₹${minRoomPrice}${minRoomPrice !== maxRoomPrice ? ' - ₹' + maxRoomPrice : ''}`,
        images: property.images && property.images.length > 0 ? [property.images[0]] : [],
        roomTypes: roomTypes,
        latitude: property.latitude,
        longitude: property.longitude
      };
    });
    
    // Create statistics for response
    const propertyTypeCount = {};
    nearbyProperties.forEach(property => {
      if (!propertyTypeCount[property.type]) {
        propertyTypeCount[property.type] = 0;
      }
      propertyTypeCount[property.type]++;
    });

    // Include debug info if requested or in development
    const includeDebug = req.query.debug === 'true' || process.env.NODE_ENV === 'development';
    const debugInfo = includeDebug ? {
      useGeospatialQuery: useGeospatial,
      executionTimeMs: executionTime,
      searchParameters: { address, latitude, longitude, searchRadius },
      resolvedLocation: locationData
    } : undefined;

    res.status(200).json({
      success: true,
      address: locationData.formatted_address,
      coordinates: {
        latitude,
        longitude
      },
      radius: searchRadius,
      totalProperties: totalCount,
      propertyTypeCount,
      properties: formattedProperties,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalCount / parseInt(limit))
      },
      debug: debugInfo
    });
  } catch (error) {
    console.error('Error in findNearbyPropertiesByAddress:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error finding nearby properties by address', 
      error: error.message 
    });
  }
};

module.exports = {
  findNearbyProperties,
  findNearbyPropertiesByType,
  findNearbyPropertiesByAddress
};
