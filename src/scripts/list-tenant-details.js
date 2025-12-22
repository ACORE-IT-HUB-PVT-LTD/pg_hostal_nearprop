/**
 * Script to list all tenant details including the new accommodation fields
 * This demonstrates access to all the new tenant fields in the API response
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

async function listTenantDetails() {
  try {
    // Get all tenants
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
    
    console.log(`Retrieved ${data.tenants.length} tenants\n`);
    
    // Display detailed tenant information for each tenant
    for (const tenant of data.tenants) {
      console.log('='.repeat(50));
      console.log(`Tenant ID: ${tenant.tenantId}`);
      console.log(`Name: ${tenant.name}`);
      console.log(`Mobile: ${tenant.mobile}`);
      console.log(`Email: ${tenant.email || 'N/A'}`);
      
      // Display accommodations with all the new fields
      if (tenant.accommodations && tenant.accommodations.length > 0) {
        console.log('\nAccommodation Details:');
        tenant.accommodations.forEach((acc, index) => {
          console.log(`\n  Accommodation #${index + 1}:`);
          console.log(`  Property: ${acc.propertyName || 'N/A'}`);
          console.log(`  Room: ${acc.roomId || 'N/A'}`);
          console.log(`  Bed: ${acc.bedId || 'N/A'}`);
          console.log(`  Rent: ₹${acc.rentAmount || 0}`);
          console.log(`  Security Deposit: ₹${acc.securityDeposit || 0}`);
          console.log(`  Move In: ${acc.moveInDate ? new Date(acc.moveInDate).toLocaleDateString() : 'N/A'}`);
          console.log(`  Move Out: ${acc.moveOutDate ? new Date(acc.moveOutDate).toLocaleDateString() : 'N/A'}`);
          console.log(`  Active: ${acc.isActive ? 'Yes' : 'No'}`);
          
          // Display the new fields
          console.log('\n  Agreement Details:');
          console.log(`  Agreement Period: ${acc.agreementPeriod || 'N/A'} ${acc.agreementPeriodType || 'months'}`);
          console.log(`  Notice Period: ${acc.noticePeriod || 'N/A'} days`);
          console.log(`  Rent Due Date: ${acc.rentOnDate || 'N/A'} (${acc.rentDateOption || 'fixed'})`);
          console.log(`  Rental Frequency: ${acc.rentalFrequency || 'Monthly'}`);
          
          if (acc.referredBy || acc.bookedBy || acc.remarks) {
            console.log('\n  Booking Information:');
            if (acc.referredBy) console.log(`  Referred By: ${acc.referredBy}`);
            if (acc.bookedBy) console.log(`  Booked By: ${acc.bookedBy}`);
            if (acc.remarks) console.log(`  Remarks: ${acc.remarks}`);
          }
          
          // Display electricity details if available
          if (acc.electricity && (acc.electricity.perUnit || acc.electricity.initialReading)) {
            console.log('\n  Electricity Details:');
            console.log(`  Rate per Unit: ₹${acc.electricity.perUnit || 'N/A'}`);
            console.log(`  Initial Reading: ${acc.electricity.initialReading || 'N/A'}`);
            if (acc.electricity.initialReadingDate) {
              console.log(`  Initial Reading Date: ${new Date(acc.electricity.initialReadingDate).toLocaleDateString()}`);
            }
            if (acc.electricity.finalReading) {
              console.log(`  Final Reading: ${acc.electricity.finalReading}`);
              console.log(`  Final Reading Date: ${new Date(acc.electricity.finalReadingDate).toLocaleDateString()}`);
            }
            if (acc.electricity.dueDescription) {
              console.log(`  Due Description: ${acc.electricity.dueDescription}`);
            }
          }
          
          // Display opening balance if available
          if (acc.openingBalance && acc.openingBalance.amount !== undefined) {
            console.log('\n  Opening Balance:');
            console.log(`  Amount: ₹${acc.openingBalance.amount}`);
            if (acc.openingBalance.startDate) {
              console.log(`  Start Date: ${new Date(acc.openingBalance.startDate).toLocaleDateString()}`);
            }
            if (acc.openingBalance.endDate) {
              console.log(`  End Date: ${new Date(acc.openingBalance.endDate).toLocaleDateString()}`);
            }
          }
        });
      } else {
        console.log('\nNo accommodation details found for this tenant.');
      }
      console.log('='.repeat(50) + '\n');
    }
    
  } catch (error) {
    console.error('Error listing tenant details:', error.message);
  }
}

// Execute the function
listTenantDetails();
