/**
 * Location Service - Handles geocoding and nearby location searches
 * Uses Google Maps API for accurate location data
 */
const axios = require('axios');
const Property = require('../models/Property');
const mongoose = require('mongoose');

// Google Maps API Key
const GOOGLE_MAPS_API_KEY = 'AIzaSyAepBinSy2JxyEvbidFz_AnFYFsFlFqQo4';

/**
 * Convert address to coordinates using Google Maps API
 * @param {string} address - Full address to geocode
 * @returns {Promise<{lat: number, lng: number}>} - Latitude and longitude
 */
const geocodeAddress = async (address) => {
  try {
    if (!address) {
      throw new Error('Address is required for geocoding');
    }

    console.log(`Geocoding address: ${address}`);
    
    const encodedAddress = encodeURIComponent(address);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${GOOGLE_MAPS_API_KEY}`;
    
    const response = await axios.get(url);
    
    if (response.data.status !== 'OK') {
      console.error('Geocoding API error:', response.data.status, response.data.error_message);
      throw new Error(`Failed to geocode address: ${response.data.status}`);
    }
    
    if (!response.data.results || response.data.results.length === 0) {
      throw new Error('No results found for this address');
    }
    
    const location = response.data.results[0].geometry.location;
    console.log(`Geocoded coordinates: ${location.lat}, ${location.lng}`);
    
    return {
      lat: location.lat,
      lng: location.lng,
      formattedAddress: response.data.results[0].formatted_address
    };
  } catch (error) {
    console.error('Error geocoding address:', error.message);
    throw new Error(`Geocoding failed: ${error.message}`);
  }
};

/**
 * Convert coordinates to address information (reverse geocoding)
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<Object>} - Address components and formatted address
 */
const reverseGeocode = async (lat, lng) => {
  try {
    if (!lat || !lng) {
      throw new Error('Latitude and longitude are required');
    }
    
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`;
    
    const response = await axios.get(url);
    
    if (response.data.status !== 'OK') {
      throw new Error(`Reverse geocoding failed: ${response.data.status}`);
    }
    
    if (!response.data.results || response.data.results.length === 0) {
      throw new Error('No address found for these coordinates');
    }
    
    // Get the full formatted address
    const formattedAddress = response.data.results[0].formatted_address;
    
    // Extract address components (city, state, country, etc.)
    const addressComponents = {};
    
    response.data.results[0].address_components.forEach(component => {
      const types = component.types;
      
      if (types.includes('locality') || types.includes('administrative_area_level_2')) {
        addressComponents.city = component.long_name;
      } else if (types.includes('administrative_area_level_1')) {
        addressComponents.state = component.long_name;
      } else if (types.includes('country')) {
        addressComponents.country = component.long_name;
      } else if (types.includes('postal_code')) {
        addressComponents.postalCode = component.long_name;
      }
    });
    
    return {
      formattedAddress,
      ...addressComponents
    };
  } catch (error) {
    console.error('Error in reverse geocoding:', error);
    throw new Error(`Reverse geocoding failed: ${error.message}`);
  }
};

/**
 * Calculate distance between two points using the Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lng1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lng2 - Longitude of second point
 * @returns {number} - Distance in kilometers
 */
const calculateDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLng/2) * Math.sin(dLng/2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c; // Distance in km
  
  return distance;
};

/**
 * Find properties near a specific location within a given radius
 * @param {number} lat - Latitude of center point
 * @param {number} lng - Longitude of center point
 * @param {number} radius - Search radius in kilometers (default: 5)
 * @param {Object} filters - Additional filters for property search
 * @returns {Promise<Array>} - Array of nearby properties with distance
 */
const findNearbyProperties = async (lat, lng, radius = 5, filters = {}) => {
  try {
    // First check if MongoDB supports geospatial queries
    let properties = [];
    let useGeospatial = false;
    
    try {
      // Check if location field exists and has a geospatial index
      const modelFields = Object.keys(Property.schema.paths);
      if (modelFields.includes('location') && 
          modelFields.includes('location.coordinates') && 
          Property.schema.indexes().some(idx => idx[0]['location'] === '2dsphere')) {
        useGeospatial = true;
      }
    } catch (err) {
      console.log('Geospatial index not available, falling back to manual calculation');
    }
    
    // If geospatial indexes are available, use MongoDB's $geoNear
    if (useGeospatial) {
      console.log('Using geospatial query for nearby search');
      
      const geoQuery = {
        location: {
          $nearSphere: {
            $geometry: {
              type: 'Point',
              coordinates: [lng, lat] // GeoJSON format is [longitude, latitude]
            },
            $maxDistance: radius * 1000 // Convert km to meters
          }
        },
        ...filters
      };
      
      properties = await Property.find(geoQuery)
        .populate('landlordId', 'name mobile email')
        .lean();
        
      // Add distance to each property
      properties.forEach(property => {
        if (property.location && property.location.coordinates) {
          property.distance = calculateDistance(
            lat, 
            lng, 
            property.location.coordinates[1], // lat in GeoJSON is second
            property.location.coordinates[0]  // lng in GeoJSON is first
          );
        }
      });
    } else {
      // Fallback to manual calculation for all properties
      console.log('Using manual calculation for nearby search');
      
      // Get all properties that match the filters
      properties = await Property.find(filters)
        .populate('landlordId', 'name mobile email')
        .lean();
      
      // Filter properties by distance
      properties = properties.filter(property => {
        // Skip properties without coordinates
        if (!property.latitude || !property.longitude) {
          return false;
        }
        
        // Calculate distance
        const distance = calculateDistance(
          lat,
          lng,
          property.latitude,
          property.longitude
        );
        
        // Add distance to property object
        property.distance = distance;
        
        // Only include properties within the radius
        return distance <= radius;
      });
    }
    
    // Sort properties by distance (closest first)
    properties.sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));
    
    return properties;
  } catch (error) {
    console.error('Error finding nearby properties:', error);
    throw new Error(`Failed to find nearby properties: ${error.message}`);
  }
};

module.exports = {
  geocodeAddress,
  reverseGeocode,
  calculateDistance,
  findNearbyProperties
};
