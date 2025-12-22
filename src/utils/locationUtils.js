const axios = require('axios');

/**
 * Google Maps API key
 * @type {string}
 */
// Use environment variable for API key if available, otherwise use default
// This API key has higher quota limits for geocoding
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || 'AIzaSyCXQDxP4W8xn7iZPB8QZg4f-K1yvEb5Zg4';

// Log API key status for debugging (without revealing the full key)
const keyPrefix = GOOGLE_MAPS_API_KEY.substring(0, 8);
const keySuffix = GOOGLE_MAPS_API_KEY.substring(GOOGLE_MAPS_API_KEY.length - 4);
console.log(`Using Google Maps API key: ${keyPrefix}...${keySuffix} (from ${process.env.GOOGLE_MAPS_API_KEY ? 'environment variable' : 'default'})`);

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {Number} lat1 - Latitude of first point
 * @param {Number} lon1 - Longitude of first point
 * @param {Number} lat2 - Latitude of second point
 * @param {Number} lon2 - Longitude of second point
 * @returns {Number} Distance in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  // Convert coordinates to radians
  const radLat1 = (Math.PI * lat1) / 180;
  const radLon1 = (Math.PI * lon1) / 180;
  const radLat2 = (Math.PI * lat2) / 180;
  const radLon2 = (Math.PI * lon2) / 180;

  // Haversine formula
  const dLat = radLat2 - radLat1;
  const dLon = radLon2 - radLon1;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(radLat1) * Math.cos(radLat2) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  // Earth radius in kilometers
  const earthRadius = 6371;
  return earthRadius * c;
}

/**
 * Get location information from coordinates using Google Maps API
 * @param {Number} lat - Latitude
 * @param {Number} lng - Longitude
 * @returns {Promise<Object>} Location data including address components
 */
async function getLocationFromCoordinates(lat, lng) {
  try {
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`
    );
    
    if (response.data && response.data.status === 'OK' && response.data.results.length > 0) {
      const result = response.data.results[0];
      
      // Extract useful address components
      const addressComponents = {};
      
      if (result.address_components) {
        result.address_components.forEach(component => {
          const types = component.types;
          
          if (types.includes('locality')) {
            addressComponents.city = component.long_name;
          } else if (types.includes('administrative_area_level_1')) {
            addressComponents.state = component.long_name;
          } else if (types.includes('country')) {
            addressComponents.country = component.long_name;
          } else if (types.includes('postal_code')) {
            addressComponents.postalCode = component.long_name;
          } else if (types.includes('sublocality_level_1')) {
            addressComponents.area = component.long_name;
          } else if (types.includes('route')) {
            addressComponents.route = component.long_name;
          }
        });
      }
      
      return {
        formatted_address: result.formatted_address,
        place_id: result.place_id,
        components: addressComponents,
        geometry: result.geometry
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching location data from Google Maps:', error);
    return null;
  }
}

/**
 * Get coordinates from address using Google Maps API
 * @param {String} address - Address to geocode
 * @returns {Promise<Object>} Coordinates and location data
 */
async function getCoordinatesFromAddress(address) {
  try {
    console.log(`Geocoding address: ${address}`);
    
    // Don't attempt to geocode empty addresses
    if (!address || address.trim() === '') {
      console.log('Geocoding skipped: Empty address provided');
      return null;
    }
    
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`;
    
    // For debugging without logging full URL with API key
    console.log(`Sending request to Google Maps Geocoding API for address: ${address}`);
    
    const response = await axios.get(url);
    
    if (response.data && response.data.status === 'OK' && response.data.results.length > 0) {
      const result = response.data.results[0];
      
      // Extract address components
      const addressComponents = {};
      
      if (result.address_components) {
        result.address_components.forEach(component => {
          const types = component.types;
          
          if (types.includes('locality')) {
            addressComponents.city = component.long_name;
          } else if (types.includes('administrative_area_level_1')) {
            addressComponents.state = component.long_name;
          } else if (types.includes('country')) {
            addressComponents.country = component.long_name;
          } else if (types.includes('postal_code')) {
            addressComponents.postalCode = component.long_name;
          } else if (types.includes('sublocality_level_1')) {
            addressComponents.area = component.long_name;
          } else if (types.includes('route')) {
            addressComponents.route = component.long_name;
          }
        });
      }
      
      console.log(`Geocoded coordinates: ${result.geometry.location.lat}, ${result.geometry.location.lng}`);
      console.log(`Formatted address: ${result.formatted_address}`);
      
      return {
        lat: result.geometry.location.lat,
        lng: result.geometry.location.lng,
        formatted_address: result.formatted_address,
        place_id: result.place_id,
        components: addressComponents
      };
    }
    
    // More detailed error logging
    if (response.data) {
      console.log(`Geocoding failed with status: ${response.data.status}`);
      if (response.data.error_message) {
        console.log(`Error message: ${response.data.error_message}`);
        
        // Handle common API key issues
        if (response.data.status === 'REQUEST_DENIED') {
          console.log('Possible API key issue. Check if key is valid, enabled for Geocoding API, and billing is set up.');
          
          // Try to suggest fallback for development if appropriate
          if (process.env.NODE_ENV !== 'production') {
            console.log('For development purposes, consider using default coordinates.');
          }
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error geocoding address with Google Maps:', error.message);
    
    // More helpful error diagnostics
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('No response received from Google Maps API');
      console.error('Network issue or API endpoint unreachable');
    }
    
    return null;
  }
}

module.exports = {
  calculateDistance,
  getLocationFromCoordinates,
  getCoordinatesFromAddress,
  GOOGLE_MAPS_API_KEY
};
