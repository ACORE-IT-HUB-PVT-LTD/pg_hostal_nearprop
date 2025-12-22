/**
 * Test script to validate the bed validation logic
 * This script tests if a bed is available for tenant assignment
 */
const mongoose = require('mongoose');
require('dotenv').config();

// Mock data to simulate our database state
const mockBeds = [
  { id: 'BED-101', status: 'active', propertyId: 'PROP-1', roomId: 'ROOM-A' },
  { id: 'BED-102', status: 'maintenance', propertyId: 'PROP-1', roomId: 'ROOM-A' },
  { id: 'BED-103', status: 'active', propertyId: 'PROP-1', roomId: 'ROOM-B' }
];

const mockTenants = [
  {
    tenantId: 'TENANT-001',
    accommodations: [{
      propertyId: 'PROP-1',
      roomId: 'ROOM-A',
      bedId: 'BED-101',
      isActive: true
    }]
  },
  {
    tenantId: 'TENANT-002',
    accommodations: [{
      propertyId: 'PROP-1',
      roomId: 'ROOM-B',
      bedId: 'BED-103',
      isActive: false // This tenant moved out, so bed should be available
    }]
  }
];

// Mock room types
const mockRooms = [
  { id: 'ROOM-A', type: 'double', propertyId: 'PROP-1' },
  { id: 'ROOM-B', type: 'single', propertyId: 'PROP-1' }
];

// Simulate our bed validation function
async function validateBedAvailability(propertyId, roomId, bedId) {
  console.log(`Checking bed availability for: Property=${propertyId}, Room=${roomId}, Bed=${bedId}`);
  
  // Check if the bed exists and is active
  const bed = mockBeds.find(b => b.id === bedId && b.propertyId === propertyId && b.roomId === roomId);
  if (!bed) {
    return {
      isValid: false,
      message: `Bed ${bedId} does not exist in room ${roomId} of property ${propertyId}`
    };
  }
  
  if (bed.status !== 'active') {
    return {
      isValid: false,
      message: `Bed ${bedId} is not active (current status: ${bed.status})`
    };
  }
  
  // Check if the bed is already assigned to an active tenant
  const existingTenant = mockTenants.find(tenant => 
    tenant.accommodations.some(acc => 
      acc.propertyId === propertyId &&
      acc.roomId === roomId &&
      acc.bedId === bedId &&
      acc.isActive === true
    )
  );
  
  if (existingTenant) {
    return {
      isValid: false,
      message: `Bed ${bedId} is already assigned to tenant ${existingTenant.tenantId}`
    };
  }
  
  return {
    isValid: true,
    message: `Bed ${bedId} is available for assignment`
  };
}

// Simulate our room capacity validation function
async function validateRoomCapacity(propertyId, roomId) {
  console.log(`Checking room capacity for: Property=${propertyId}, Room=${roomId}`);
  
  // Get the room type
  const room = mockRooms.find(r => r.id === roomId && r.propertyId === propertyId);
  if (!room) {
    return {
      isValid: false,
      message: `Room ${roomId} does not exist in property ${propertyId}`
    };
  }
  
  // Get the number of active tenants in the room
  const activeTenantsInRoom = mockTenants.filter(tenant => 
    tenant.accommodations.some(acc => 
      acc.propertyId === propertyId &&
      acc.roomId === roomId &&
      acc.isActive === true
    )
  ).length;
  
  // Define capacity based on room type
  let capacity;
  switch(room.type.toLowerCase()) {
    case 'single':
      capacity = 1;
      break;
    case 'double':
      capacity = 2;
      break;
    case 'triple':
      capacity = 3;
      break;
    case 'quad':
      capacity = 4;
      break;
    default:
      capacity = 1;
  }
  
  if (activeTenantsInRoom >= capacity) {
    return {
      isValid: false,
      message: `Room ${roomId} is at full capacity (${capacity}) with ${activeTenantsInRoom} active tenants`
    };
  }
  
  return {
    isValid: true,
    message: `Room ${roomId} has available capacity (${activeTenantsInRoom}/${capacity})`
  };
}

// Run our tests
async function runTests() {
  console.log('=== Testing Bed Validation Logic ===\n');
  
  // Test 1: Check an already occupied bed (BED-101)
  console.log('Test 1: Checking an occupied bed');
  const test1 = await validateBedAvailability('PROP-1', 'ROOM-A', 'BED-101');
  console.log(`Result: ${test1.isValid ? 'Available' : 'Not Available'} - ${test1.message}\n`);
  
  // Test 2: Check a bed in maintenance (BED-102)
  console.log('Test 2: Checking a bed in maintenance');
  const test2 = await validateBedAvailability('PROP-1', 'ROOM-A', 'BED-102');
  console.log(`Result: ${test2.isValid ? 'Available' : 'Not Available'} - ${test2.message}\n`);
  
  // Test 3: Check a bed that was previously occupied but is now free (BED-103)
  console.log('Test 3: Checking a bed that was previously occupied but is now free');
  const test3 = await validateBedAvailability('PROP-1', 'ROOM-B', 'BED-103');
  console.log(`Result: ${test3.isValid ? 'Available' : 'Not Available'} - ${test3.message}\n`);
  
  // Test 4: Check a non-existent bed
  console.log('Test 4: Checking a non-existent bed');
  const test4 = await validateBedAvailability('PROP-1', 'ROOM-A', 'BED-999');
  console.log(`Result: ${test4.isValid ? 'Available' : 'Not Available'} - ${test4.message}\n`);
  
  // Test 5: Check room capacity for a room at capacity
  console.log('Test 5: Checking room capacity for a single room with one tenant');
  const test5 = await validateRoomCapacity('PROP-1', 'ROOM-B');
  console.log(`Result: ${test5.isValid ? 'Has Capacity' : 'At Capacity'} - ${test5.message}\n`);
  
  // Test 6: Check room capacity for a room with available capacity
  console.log('Test 6: Checking room capacity for a double room with one tenant');
  const test6 = await validateRoomCapacity('PROP-1', 'ROOM-A');
  console.log(`Result: ${test6.isValid ? 'Has Capacity' : 'At Capacity'} - ${test6.message}\n`);
}

runTests().then(() => console.log('Tests completed!'));
