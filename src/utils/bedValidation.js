/**
 * Utility functions for validating bed and room availability
 */

/**
 * Validates if a bed is available for tenant assignment
 * @param {Object} bed - The bed object to check
 * @returns {Object} - { isAvailable: boolean, message: string, occupiedBy?: string }
 */
const validateBedAvailability = (bed) => {
  // Check if bed exists
  if (!bed) {
    return { 
      isAvailable: false, 
      message: 'Bed not found' 
    };
  }
  
  // Check bed status
  if (bed.status !== 'Available') {
    return { 
      isAvailable: false, 
      message: 'Selected bed is not available' 
    };
  }
  
  // Check if there are any tenants already assigned to this bed
  if (bed.tenants && bed.tenants.length > 0) {
    return { 
      isAvailable: false, 
      message: 'This bed already has a tenant assigned to it',
      occupiedBy: bed.tenants.map(t => t.name).join(', ') 
    };
  }
  
  return { isAvailable: true };
};

/**
 * Validates if a room has capacity for a new tenant based on its type
 * @param {Object} room - The room object to check
 * @returns {Object} - { hasCapacity: boolean, message: string }
 */
const validateRoomCapacity = (room) => {
  if (!room || !room.type) {
    return { 
      hasCapacity: true 
    };
  }
  
  const tenantCount = room.tenants ? room.tenants.length : 0;
  
  switch(room.type) {
    case 'Single Sharing':
      if (tenantCount >= 1) {
        return {
          hasCapacity: false,
          message: 'This is a Single Sharing room and already has a tenant'
        };
      }
      break;
    case 'Double Sharing':
      if (tenantCount >= 2) {
        return {
          hasCapacity: false,
          message: 'This Double Sharing room is already at full capacity'
        };
      }
      break;
    case 'Triple Sharing':
      if (tenantCount >= 3) {
        return {
          hasCapacity: false,
          message: 'This Triple Sharing room is already at full capacity'
        };
      }
      break;
    case 'Four Sharing':
      if (tenantCount >= 4) {
        return {
          hasCapacity: false,
          message: 'This Four Sharing room is already at full capacity'
        };
      }
      break;
    case 'Five Sharing':
      if (tenantCount >= 5) {
        return {
          hasCapacity: false,
          message: 'This Five Sharing room is already at full capacity'
        };
      }
      break;
    case 'Six Sharing':
      if (tenantCount >= 6) {
        return {
          hasCapacity: false,
          message: 'This Six Sharing room is already at full capacity'
        };
      }
      break;
    case 'More Than 6 Sharing':
      // For these rooms, we'll assume they can accommodate many people
      // but still have some reasonable limit (e.g., 12)
      if (tenantCount >= 12) {
        return {
          hasCapacity: false,
          message: 'This room is already at full capacity'
        };
      }
      break;
  }
  
  return { hasCapacity: true };
};

module.exports = {
  validateBedAvailability,
  validateRoomCapacity
};
