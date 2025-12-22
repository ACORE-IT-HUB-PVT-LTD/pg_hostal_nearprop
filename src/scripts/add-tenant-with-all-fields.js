/**
 * Script to add a tenant with all the new fields and assign to a property
 * This demonstrates the combined add-tenant and assign-tenant API
 */
const fetch = require('node-fetch');
const dotenv = require('dotenv');
dotenv.config();

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:3000';
const TOKEN = process.env.AUTH_TOKEN; // Your authentication token

if (!TOKEN) {
  console.error('Error: Authentication token is required. Set AUTH_TOKEN environment variable.');
  process.exit(1);
}

// Sample tenant data with all the new fields
const tenantData = {
  // Basic tenant information
  name: "John Smith",
  email: "john@example.com",
  aadhaar: "1234-5678-9012",
  mobile: "9876543210",
  permanentAddress: "123 Main Street, City",
  work: "Software Engineer",
  dob: "1990-01-15",
  maritalStatus: "Unmarried",
  fatherName: "Robert Smith",
  fatherMobile: "8765432109",
  motherName: "Mary Smith",
  motherMobile: "7654321098",
  photo: "https://example.com/photo.jpg", // URL to photo

  // Property assignment (change these to match your actual property/room IDs)
  propertyId: "64e6f5c0e7d81f001c1a8123", // Replace with actual property ID
  roomId: "R-001",
  bedId: "B-001",  // Optional, if applicable
  
  // Rental details
  moveInDate: new Date().toISOString(),
  rentAmount: 10000,
  securityDeposit: 20000,
  
  // New fields - Move out and agreement details
  moveOutDate: "", // Leave empty for now
  noticePeriod: 30, // 30 days notice period
  agreementPeriod: 11, // 11 months agreement
  agreementPeriodType: "months", // 'months' or 'years'
  
  // Rent payment details
  rentOnDate: 5, // Rent due on 5th of every month
  rentDateOption: "fixed", // 'fixed', 'joining', or 'month_end'
  rentalFrequency: "Monthly", // Monthly, Quarterly, etc.
  
  // Booking information
  referredBy: "Facebook Ad",
  remarks: "Clean tenant, good background",
  bookedBy: "Online booking",
  
  // Electricity details
  electricityPerUnit: 8.5, // Rs. 8.5 per unit
  initialReading: 1000, // Starting meter reading
  initialReadingDate: new Date().toISOString(),
  finalReading: null, // Will be filled at move-out
  finalReadingDate: null, // Will be filled at move-out
  electricityDueDescription: "Electricity charged at actual usage",
  
  // Opening balance details (if applicable)
  openingBalanceStartDate: new Date().toISOString(),
  openingBalanceEndDate: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString(),
  openingBalanceAmount: 0 // No opening balance
};

async function addTenant() {
  try {
    const response = await fetch(`${API_URL}/api/landlord/tenant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`
      },
      body: JSON.stringify(tenantData)
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('Error:', data.message || 'Failed to add tenant');
      return;
    }
    
    console.log('Tenant added successfully!');
    console.log('Tenant ID:', data.tenant.tenantId);
    console.log('Name:', data.tenant.name);
    
    // Check if tenant was assigned to property
    if (data.tenant.accommodations && data.tenant.accommodations.length > 0) {
      const accommodation = data.tenant.accommodations[0];
      console.log('\nProperty Assignment:');
      console.log('Property:', accommodation.propertyName);
      console.log('Room ID:', accommodation.roomId);
      if (accommodation.bedId) console.log('Bed ID:', accommodation.bedId);
      console.log('Rent Amount:', accommodation.rentAmount);
      console.log('Move In Date:', new Date(accommodation.moveInDate).toLocaleDateString());
      console.log('Agreement Period:', accommodation.agreementPeriod, accommodation.agreementPeriodType);
      console.log('Rent Due Date:', accommodation.rentOnDate);
      
      // Show electricity details if available
      if (accommodation.electricity && accommodation.electricity.perUnit) {
        console.log('\nElectricity Details:');
        console.log('Rate per Unit:', accommodation.electricity.perUnit);
        console.log('Initial Reading:', accommodation.electricity.initialReading);
        console.log('Reading Date:', new Date(accommodation.electricity.initialReadingDate).toLocaleDateString());
      }
    } else {
      console.log('\nTenant created but not assigned to any property.');
    }
  } catch (error) {
    console.error('Error adding tenant:', error.message);
  }
}

// Execute the function
addTenant();
