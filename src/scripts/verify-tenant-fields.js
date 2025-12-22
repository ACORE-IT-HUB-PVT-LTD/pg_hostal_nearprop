/**
 * Script to verify tenant creation by listing all tenants
 * with their new fields after creation
 */
const fetch = require('node-fetch');

// Configuration
const API_URL = 'http://localhost:3002';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4ODg2YzgwNDcxMGYxNWIxMzdlM2I1NyIsInJvbGUiOiJsYW5kbG9yZCIsImVtYWlsIjoic29uakBleGFtcGxlLmNvbSIsImlhdCI6MTc1Mzc3MTEzNiwiZXhwIjoxNzU2MzYzMTM2fQ.0qJ6PV622L_uINC2uozUQIsY_zHo4-ujEPp9-fjmybk';

async function verifyTenants() {
  try {
    console.log('Fetching all tenants to verify creation and fields...');
    
    const response = await fetch(`${API_URL}/api/landlord/tenant`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${TOKEN}`
      }
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error('Error:', data.message || 'Failed to fetch tenants');
      return;
    }
    
    console.log(`\nFound ${data.tenants.length} tenants`);
    
    // Find the most recently created tenant (likely our test tenant)
    const sortedTenants = [...data.tenants].sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    );
    
    if (sortedTenants.length > 0) {
      const latestTenant = sortedTenants[0];
      console.log('\nMost recently created tenant:');
      console.log('='.repeat(50));
      console.log(`Tenant ID: ${latestTenant.tenantId}`);
      console.log(`Name: ${latestTenant.name}`);
      console.log(`Email: ${latestTenant.email}`);
      console.log(`Created: ${new Date(latestTenant.createdAt).toLocaleString()}`);
      
      // Check accommodations and new fields
      if (latestTenant.accommodations && latestTenant.accommodations.length > 0) {
        const acc = latestTenant.accommodations[0];
        console.log('\nAccommodation Details:');
        console.log(`Property ID: ${acc.propertyId}`);
        console.log(`Room ID: ${acc.roomId}`);
        console.log(`Bed ID: ${acc.bedId || 'N/A'}`);
        console.log(`Rent Amount: ${acc.rentAmount}`);
        console.log(`Move In Date: ${new Date(acc.moveInDate).toLocaleDateString()}`);
        
        // Verify new fields are present
        console.log('\nNew Fields:');
        console.log(`Notice Period: ${acc.noticePeriod || 'N/A'} days`);
        console.log(`Agreement Period: ${acc.agreementPeriod || 'N/A'} ${acc.agreementPeriodType || 'months'}`);
        console.log(`Rent Due Date: ${acc.rentOnDate || 'N/A'} (${acc.rentDateOption || 'fixed'})`);
        console.log(`Rental Frequency: ${acc.rentalFrequency || 'Monthly'}`);
        console.log(`Referred By: ${acc.referredBy || 'N/A'}`);
        console.log(`Booked By: ${acc.bookedBy || 'N/A'}`);
        console.log(`Remarks: ${acc.remarks || 'N/A'}`);
        
        // Check electricity details
        if (acc.electricity) {
          console.log('\nElectricity Details:');
          console.log(`Rate per Unit: ${acc.electricity.perUnit || 'N/A'}`);
          console.log(`Initial Reading: ${acc.electricity.initialReading || 'N/A'}`);
          if (acc.electricity.initialReadingDate) {
            console.log(`Initial Reading Date: ${new Date(acc.electricity.initialReadingDate).toLocaleDateString()}`);
          }
        } else {
          console.log('\nElectricity details not found');
        }
        
        // Check opening balance
        if (acc.openingBalance) {
          console.log('\nOpening Balance:');
          console.log(`Amount: ${acc.openingBalance.amount || 0}`);
          if (acc.openingBalance.startDate) {
            console.log(`Start Date: ${new Date(acc.openingBalance.startDate).toLocaleDateString()}`);
          }
          if (acc.openingBalance.endDate) {
            console.log(`End Date: ${new Date(acc.openingBalance.endDate).toLocaleDateString()}`);
          }
        } else {
          console.log('\nOpening balance details not found');
        }
      } else {
        console.log('\nNo accommodation details found for this tenant');
      }
      console.log('='.repeat(50));
    } else {
      console.log('No tenants found in the system');
    }
  } catch (error) {
    console.error('Error verifying tenants:', error.message);
  }
}

// Run the verification
verifyTenants();
