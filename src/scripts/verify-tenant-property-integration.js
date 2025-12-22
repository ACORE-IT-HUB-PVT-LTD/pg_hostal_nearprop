/**
 * Script to verify that a tenant added through the enhanced API
 * is properly displayed in both tenant API and property API
 */
const fetch = require('node-fetch');

// Configuration
const API_URL = 'http://localhost:3002';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4ODg2YzgwNDcxMGYxNWIxMzdlM2I1NyIsInJvbGUiOiJsYW5kbG9yZCIsImVtYWlsIjoic29uakBleGFtcGxlLmNvbSIsImlhdCI6MTc1Mzc3MTEzNiwiZXhwIjoxNzU2MzYzMTM2fQ.0qJ6PV622L_uINC2uozUQIsY_zHo4-ujEPp9-fjmybk';

// We'll use property: "6888ae279577cafb73c6f547" (PROP23)
const PROPERTY_ID = "6888ae279577cafb73c6f547";
const ROOM_ID = "ROOM-trf1zodja";
const BED_ID = "BED-s27i6yew0";

async function testTenantPropertyIntegration() {
  try {
    console.log('Step 1: Creating a tenant with enhanced fields and assigning to property...');
    
    // Generate unique tenant details to avoid duplicate aadhaar errors
    const timestamp = Date.now();
    const tenantData = {
      name: `Test Tenant ${timestamp}`,
      email: `tenant${timestamp}@example.com`,
      aadhaar: `987654${timestamp}`.substring(0, 12),
      mobile: `98765${timestamp}`.substring(0, 10),
      propertyId: PROPERTY_ID,
      roomId: ROOM_ID,
      bedId: BED_ID,
      moveInDate: new Date().toISOString(),
      rentAmount: 9000,
      securityDeposit: 18000,
      // Enhanced fields
      noticePeriod: 30,
      agreementPeriod: 11,
      agreementPeriodType: "months",
      rentOnDate: 5,
      rentDateOption: "fixed",
      rentalFrequency: "Monthly",
      referredBy: "Integration Test",
      remarks: "Test tenant for API verification",
      bookedBy: "API Test",
      electricityPerUnit: 8.75,
      initialReading: 1000,
      initialReadingDate: new Date().toISOString()
    };
    
    // Create tenant
    const tenantResponse = await fetch(`${API_URL}/api/landlord/tenant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`
      },
      body: JSON.stringify(tenantData)
    });
    
    if (!tenantResponse.ok) {
      const error = await tenantResponse.json();
      console.error('Error creating tenant:', error);
      return;
    }
    
    const tenantResult = await tenantResponse.json();
    console.log('Tenant created successfully!');
    console.log('Tenant ID:', tenantResult.tenant.tenantId);
    const createdTenantId = tenantResult.tenant.tenantId;
    
    // Give the system a moment to process and update all data
    console.log('Waiting for system to process updates...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('\nStep 2: Verify tenant is returned with all fields in tenant API...');
    const getTenantResponse = await fetch(`${API_URL}/api/landlord/tenant/${createdTenantId}`, {
      headers: {
        'Authorization': `Bearer ${TOKEN}`
      }
    });
    
    if (!getTenantResponse.ok) {
      const error = await getTenantResponse.json();
      console.error('Error fetching tenant:', error);
      return;
    }
    
    const tenantDetails = await getTenantResponse.json();
    console.log('Tenant details retrieved successfully!');
    
    // Check accommodation fields
    if (tenantDetails.tenant.accommodations && tenantDetails.tenant.accommodations.length > 0) {
      const acc = tenantDetails.tenant.accommodations[0];
      console.log('Accommodation details from tenant API:');
      console.log('- Property ID:', acc.propertyId);
      console.log('- Room ID:', acc.roomId);
      console.log('- Bed ID:', acc.bedId);
      console.log('- Notice Period:', acc.noticePeriod);
      console.log('- Agreement Period:', acc.agreementPeriod, acc.agreementPeriodType);
      console.log('- Rent Date:', acc.rentOnDate, acc.rentDateOption);
      
      if (acc.electricity) {
        console.log('- Electricity Rate:', acc.electricity.perUnit);
        console.log('- Initial Reading:', acc.electricity.initialReading);
      }
    }
    
    console.log('\nStep 3: Verify tenant appears in property data via property API...');
    const getPropertyResponse = await fetch(`${API_URL}/api/landlord/property/${PROPERTY_ID}`, {
      headers: {
        'Authorization': `Bearer ${TOKEN}`
      }
    });
    
    if (!getPropertyResponse.ok) {
      const error = await getPropertyResponse.json();
      console.error('Error fetching property:', error);
      return;
    }
    
    const propertyDetails = await getPropertyResponse.json();
    console.log('Property details retrieved successfully!');
    
    // Find the room and bed with our tenant
    const room = propertyDetails.property.rooms.find(r => r.roomId === ROOM_ID);
    if (!room) {
      console.error('Room not found in property data!');
      return;
    }
    
    const bed = room.beds.find(b => b.bedId === BED_ID);
    if (!bed) {
      console.error('Bed not found in room data!');
      return;
    }
    
    // Find our tenant in the bed's tenants array
    const tenant = bed.tenants.find(t => t.tenantId === createdTenantId);
    if (!tenant) {
      console.error('Tenant not found in bed data!');
      return;
    }
    
    console.log('Tenant found in property data:');
    console.log('- Tenant ID:', tenant.tenantId);
    console.log('- Name:', tenant.name);
    console.log('- Room ID:', tenant.roomId);
    console.log('- Bed ID:', tenant.bedId);
    
    // Check if enhanced fields are present in property's tenant data
    console.log('\nEnhanced fields in property data:');
    console.log('- Notice Period:', tenant.noticePeriod);
    console.log('- Agreement Period:', tenant.agreementPeriod, tenant.agreementPeriodType);
    console.log('- Rent Date:', tenant.rentOnDate, tenant.rentDateOption);
    console.log('- Referred By:', tenant.referredBy);
    console.log('- Remarks:', tenant.remarks);
    
    if (tenant.electricity) {
      console.log('- Electricity Rate:', tenant.electricity.perUnit);
      console.log('- Initial Reading:', tenant.electricity.initialReading);
    } else {
      console.log('- Electricity data not found in property tenant data');
    }
    
    if (tenant.openingBalance) {
      console.log('- Opening Balance Amount:', tenant.openingBalance.amount);
    } else {
      console.log('- Opening balance data not found in property tenant data');
    }
    
    console.log('\nVerification complete!');
    if (tenant.electricity && tenant.openingBalance && 
        tenant.noticePeriod && tenant.agreementPeriod) {
      console.log('SUCCESS: All enhanced tenant fields are properly saved and accessible in both APIs!');
    } else {
      console.log('WARNING: Some enhanced fields may be missing from the property API response.');
    }
    
  } catch (error) {
    console.error('Error during test:', error.message);
  }
}

// Run the test
testTenantPropertyIntegration();
