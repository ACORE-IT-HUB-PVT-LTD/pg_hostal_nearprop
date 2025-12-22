/**
 * Property Geocoding Middleware
 * Automatically geocodes property addresses when creating or updating properties
 */

const { getCoordinatesFromAddress } = require('../utils/locationUtils');

/**
 * Middleware to geocode property address before saving
 */
const geocodePropertyAddress = async (req, res, next) => {
  try {
    // For update operations, check if we need to update coordinates
    const isAddressUpdated = req.method === 'PUT' && req.body.address;
    
    // Skip geocoding if coordinates are provided and address is not being updated
    if (req.body.latitude && req.body.longitude && !isAddressUpdated) {
      console.log('Using provided coordinates:', req.body.latitude, req.body.longitude);
      
      // Make sure the GeoJSON location field is updated
      req.body.location = {
        type: 'Point',
        coordinates: [req.body.longitude, req.body.latitude]
      };
      
      return next();
    }
    
    // Skip geocoding if no address is provided
    if (!req.body.address) {
      console.log('Skipping geocoding: no address provided');
      return next();
    }
    
    // Build complete address from components
    const addressComponents = [
      req.body.address,
      req.body.landmark,
      req.body.city,
      req.body.state,
      req.body.pinCode
    ].filter(Boolean);
    
    const fullAddress = addressComponents.join(', ');
    console.log(`Geocoding property address: ${fullAddress}`);
    
    // Get coordinates from address
    const locationData = await getCoordinatesFromAddress(fullAddress);
    
    if (locationData && locationData.lat && locationData.lng) {
      // Add coordinates to request body
      req.body.latitude = locationData.lat;
      req.body.longitude = locationData.lng;
      
      // Add GeoJSON location field
      req.body.location = {
        type: 'Point',
        coordinates: [locationData.lng, locationData.lat]
      };
      
      // Update address components from geocoding result
      if (locationData.components) {
        if (!req.body.city && locationData.components.city) {
          req.body.city = locationData.components.city;
        }
        
        if (!req.body.state && locationData.components.state) {
          req.body.state = locationData.components.state;
        }
        
        if (!req.body.pinCode && locationData.components.postalCode) {
          req.body.pinCode = locationData.components.postalCode;
        }
      }
      
      console.log(`Geocoding successful: [${locationData.lat}, ${locationData.lng}]`);
    } else {
      console.log('Geocoding failed: could not determine coordinates');
      
      // For new properties, if geocoding fails, use a default location for the specified city
      if (req.method === 'POST' && req.body.city) {
        console.log(`Using fallback coordinates for city: ${req.body.city}`);
        
        // Common city coordinates as fallbacks
        const cityCoordinates = {
          'Indore': { lat: 22.7196, lng: 75.8577 },
          'Satna': { lat: 24.5789, lng: 80.8322 },
          'Delhi': { lat: 28.7041, lng: 77.1025 },
          'Bangalore': { lat: 12.9716, lng: 77.5946 },
          'Mumbai': { lat: 19.0760, lng: 72.8777 },
          'Hyderabad': { lat: 17.3850, lng: 78.4867 },
          'Chennai': { lat: 13.0827, lng: 80.2707 },
          'Kolkata': { lat: 22.5726, lng: 88.3639 }
        };
        
        // Use city coordinates if available, otherwise use a generic India location
        const cityCoords = cityCoordinates[req.body.city] || { lat: 20.5937, lng: 78.9629 };
        
        // Add slight random variation to prevent all properties in same city having identical coordinates
        const variation = 0.01; // ~1km variation
        const lat = cityCoords.lat + (Math.random() * variation * 2 - variation);
        const lng = cityCoords.lng + (Math.random() * variation * 2 - variation);
        
        req.body.latitude = lat;
        req.body.longitude = lng;
        req.body.location = {
          type: 'Point',
          coordinates: [lng, lat]
        };
        
        console.log(`Using fallback coordinates: [${lat}, ${lng}]`);
      }
    }
    
    next();
  } catch (error) {
    console.error('Error in geocoding middleware:', error);
    
    // Continue with the request even if geocoding fails
    next();
  }
};

module.exports = {
  geocodePropertyAddress
};
