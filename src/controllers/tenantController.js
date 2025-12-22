const Tenant = require('../models/Tenant');
const Property = require('../models/Property');
const mongoose = require('mongoose');
const { setCache, getCache } = require('../utils/redis');
const { validateBedAvailability, validateRoomCapacity } = require('../utils/bedValidation');

/**
 * Add a new tenant to the system and optionally assign to a property
 * Enhanced version with additional rental and utility management fields
 */
const addTenant = async (req, res) => {
  const { 
    // Basic tenant information
    name, email, aadhaar, mobile, permanentAddress, work, dob, maritalStatus,
    fatherName, fatherMobile, motherName, motherMobile, photo,
    
    // Property assignment
    propertyId, roomId, bedId, moveInDate, rentAmount, securityDeposit,
    
    // Additional fields requested by client
    moveOutDate,                      // Optional move out date
    noticePeriod,                     // Notice period in days (10, 15, 20, 30, 45, 60)
    agreementPeriod,                  // Agreement period in months (1-12) or years
    agreementPeriodType,              // 'months' or 'years'
    rentOnDate,                       // Rent due date (1-31)
    rentDateOption,                   // 'fixed', 'joining', 'month_end'
    rentalFrequency,                  // Frequency of rent payments
    referredBy,                       // Who referred this tenant
    remarks,                          // Any additional remarks
    bookedBy,                         // How the tenant found the property
    
    // Electricity billing
    electricityPerUnit,               // Cost per unit of electricity
    initialReading,                   // Initial meter reading
    finalReading,                     // Final meter reading
    initialReadingDate,               // Date of initial reading
    finalReadingDate,                 // Date of final reading
    electricityDueDescription,        // Description of electricity dues
    
    // Opening balance details
    openingBalanceStartDate,          // Start date for opening balance calculation
    openingBalanceEndDate,            // End date for opening balance calculation
    openingBalanceAmount              // Pre-calculated opening balance amount
  } = req.body;
  
  try {
    // Basic validation
    if (!name || !aadhaar || !mobile) {
      return res.status(400).json({ message: 'Name, Aadhaar, and Mobile are required fields' });
    }

    // Check if tenant with same aadhaar already exists
    let tenant = await Tenant.findOne({ aadhaar });
    
    if (!tenant) {
      // Create a new tenant
      tenant = new Tenant({
        name,
        email,
        aadhaar,
        mobile,
        permanentAddress,
        work,
        dob,
        maritalStatus,
        fatherName,
        fatherMobile,
        motherName,
        motherMobile,
        photo,
        electricityBill: [],
        accommodations: [] // Initialize accommodations as empty array
      });
    } else {
      // For existing tenant, check if already has active accommodations in this property/room
      const existingActiveAccommodation = tenant.accommodations?.find(acc => 
        acc.propertyId && acc.propertyId.toString() === propertyId && 
        acc.roomId === roomId && 
        acc.isActive === true
      );
      
      if (existingActiveAccommodation) {
        // If trying to add to the same bed, return an error
        if (existingActiveAccommodation.bedId === bedId && bedId) {
          return res.status(400).json({ 
            message: 'Tenant already has an active accommodation in this bed',
            existingAccommodation: existingActiveAccommodation
          });
        }
        
        // If adding to a different bed in the same room, mark the previous one as inactive
        existingActiveAccommodation.isActive = false;
      }
      
      // Deactivate any other accommodations with the same bedId if specified
      if (bedId) {
        tenant.accommodations.forEach(acc => {
          if (acc.bedId === bedId && acc.isActive) {
            acc.isActive = false;
          }
        });
      }
    }
    
    // If propertyId, roomId are provided, assign tenant to that property
    if (propertyId && roomId) {
      // Generate landlord-specific tenant ID
      const localTenantId = `L-${req.user.id.toString().substr(-6)}-${Math.random().toString(36).substr(2, 6)}`;
      
      const property = await Property.findOne({ 
        _id: propertyId,
        landlordId: req.user.id // Ensure the landlord owns this property
      });
      
      if (!property) {
        return res.status(404).json({ message: 'Property not found or you do not have access' });
      }
      
      // Find the room
      const room = property.rooms.find(r => r.roomId === roomId);
      if (!room) {
        return res.status(404).json({ message: 'Room not found in this property' });
      }
      
      // Check if bed is specified and available
      let bed = null;
      if (bedId) {
        bed = room.beds.find(b => b.bedId === bedId);
        if (!bed) {
          return res.status(404).json({ message: 'Bed not found in this room' });
        }
        
        // Validate bed availability using utility function
        const bedValidation = validateBedAvailability(bed);
        if (!bedValidation.isAvailable) {
          return res.status(400).json({ 
            message: bedValidation.message,
            occupiedBy: bedValidation.occupiedBy 
          });
        }
      }
      
      // Validate room capacity based on room type
      const capacityValidation = validateRoomCapacity(room);
      if (!capacityValidation.hasCapacity) {
        return res.status(400).json({ message: capacityValidation.message });
      }
      
      // Initialize accommodations array if it doesn't exist
      if (!tenant.accommodations) {
        tenant.accommodations = [];
      }
      
      // Check if this tenant already has an accommodation in this property+room
      const existingAccIndex = tenant.accommodations.findIndex(acc => 
        acc.propertyId.toString() === propertyId &&
        acc.roomId === roomId &&
        acc.isActive === true
      );
      
      if (existingAccIndex !== -1) {
        // If found, deactivate the old accommodation
        tenant.accommodations[existingAccIndex].isActive = false;
      }

      // Create accommodation object with all the new fields
      const accommodation = {
        landlordId: req.user.id,
        propertyId: property._id,
        propertyName: property.name,
        roomId,
        bedId: bedId || '', // Ensure bedId is explicitly set to empty string if not provided
        moveInDate: moveInDate || new Date(),
        moveOutDate: moveOutDate || null,
        rentAmount: rentAmount || (bed ? bed.price : room.price),
        securityDeposit: securityDeposit || 0,
        pendingDues: 0,
        monthlyCollection: 0,
        isActive: true,
        securityDepositStatus: 'Pending',
        securityDepositRefundAmount: 0,
        localTenantId,
        // Add the new fields
        noticePeriod: noticePeriod || null,
        agreementPeriod: agreementPeriod || null,
        agreementPeriodType: agreementPeriodType || 'months',
        rentOnDate: rentOnDate || null,
        rentDateOption: rentDateOption || 'fixed',
        rentalFrequency: rentalFrequency || 'Monthly',
        referredBy: referredBy || null,
        remarks: remarks || null,
        bookedBy: bookedBy || null,
        // Electricity billing information
        electricity: {
          perUnit: electricityPerUnit || null,
          initialReading: initialReading || null,
          finalReading: finalReading || null,
          initialReadingDate: initialReadingDate || null,
          finalReadingDate: finalReadingDate || null,
          dueDescription: electricityDueDescription || null
        },
        // Opening balance details
        openingBalance: {
          startDate: openingBalanceStartDate || null,
          endDate: openingBalanceEndDate || null,
          amount: openingBalanceAmount || 0
        }
      };
      
      tenant.accommodations.push(accommodation);
      
      // Update the room/bed status
      if (bedId && bed) {
        // Add tenant to the bed with all enhanced fields
        bed.status = 'Not Available';
        const tenantEntry = {
          tenantId: tenant.tenantId,
          name: tenant.name,
          email: tenant.email,
          aadhaar: tenant.aadhaar,
          mobile: tenant.mobile,
          roomId,
          bedId,
          landlordId: req.user.id,
          moveInDate: moveInDate || new Date(),
          moveOutDate: moveOutDate || null,
          rentAmount: rentAmount || bed.price,
          securityDeposit: securityDeposit || 0,
          // Add all the new fields
          noticePeriod: noticePeriod || null,
          agreementPeriod: agreementPeriod || null,
          agreementPeriodType: agreementPeriodType || 'months',
          rentOnDate: rentOnDate || null,
          rentDateOption: rentDateOption || 'fixed',
          rentalFrequency: rentalFrequency || 'Monthly',
          referredBy: referredBy || null,
          remarks: remarks || null,
          bookedBy: bookedBy || null,
          // Electricity billing information
          electricity: {
            perUnit: electricityPerUnit || null,
            initialReading: initialReading || null,
            finalReading: finalReading || null,
            initialReadingDate: initialReadingDate || null,
            finalReadingDate: finalReadingDate || null,
            dueDescription: electricityDueDescription || null
          },
          // Opening balance details
          openingBalance: {
            startDate: openingBalanceStartDate || null,
            endDate: openingBalanceEndDate || null,
            amount: openingBalanceAmount || 0
          }
        };
        bed.tenants.push(tenantEntry);
      } else {
        // Add tenant directly to the room if no bed is specified with all enhanced fields
        room.tenants.push({
          tenantId: tenant.tenantId,
          name: tenant.name,
          email: tenant.email,
          aadhaar: tenant.aadhaar,
          mobile: tenant.mobile,
          roomId,
          landlordId: req.user.id,
          moveInDate: moveInDate || new Date(),
          moveOutDate: moveOutDate || null,
          rentAmount: rentAmount || room.price,
          securityDeposit: securityDeposit || 0,
          // Add all the new fields
          noticePeriod: noticePeriod || null,
          agreementPeriod: agreementPeriod || null,
          agreementPeriodType: agreementPeriodType || 'months',
          rentOnDate: rentOnDate || null,
          rentDateOption: rentDateOption || 'fixed',
          rentalFrequency: rentalFrequency || 'Monthly',
          referredBy: referredBy || null,
          remarks: remarks || null,
          bookedBy: bookedBy || null,
          // Electricity billing information
          electricity: {
            perUnit: electricityPerUnit || null,
            initialReading: initialReading || null,
            finalReading: finalReading || null,
            initialReadingDate: initialReadingDate || null,
            finalReadingDate: finalReadingDate || null,
            dueDescription: electricityDueDescription || null
          },
          // Opening balance details
          openingBalance: {
            startDate: openingBalanceStartDate || null,
            endDate: openingBalanceEndDate || null,
            amount: openingBalanceAmount || 0
          }
        });
      }
      
      // Update occupancy statistics
      if (!property.occupiedSpace) property.occupiedSpace = 0;
      property.occupiedSpace += 1;
      
      await property.save();
    }
    
    await tenant.save();
    
    // Update cache
    await setCache(`tenant:${tenant.tenantId}`, tenant, 3600);
    
    // Filter accommodations to only return active ones or the most recent one
    const filteredAccommodations = tenant.accommodations
      .map(acc => {
        // Ensure bedId is never null or undefined, but an empty string at minimum
        if (!acc.bedId && acc.bedId !== '') {
          acc.bedId = '';
        }
        return acc;
      })
      .filter(acc => acc.isActive === true || 
                     (bedId && acc.bedId === bedId && acc.roomId === roomId));
    
    // Create the response object
    res.status(201).json({ 
      message: 'Tenant added successfully',
      tenant: {
        tenantId: tenant.tenantId,
        name: tenant.name,
        email: tenant.email,
        mobile: tenant.mobile,
        aadhaar: tenant.aadhaar,
        permanentAddress: tenant.permanentAddress,
        work: tenant.work,
        dob: tenant.dob,
        maritalStatus: tenant.maritalStatus,
        fatherName: tenant.fatherName,
        fatherMobile: tenant.fatherMobile,
        motherName: tenant.motherName,
        motherMobile: tenant.motherMobile,
        photo: tenant.photo ? "Photo exists" : null,
        accommodations: filteredAccommodations,
      }
    });
  } catch (error) {
    console.error('Error in addTenant:', error);
    res.status(500).json({ message: 'Error adding tenant', error: error.message });
  }
};

/**
 * Add an electricity bill for a tenant
 * This function supports adding a bill with minimal information (just tenantId and amount)
 * or with detailed information including readings, units, etc.
 */
const addElectricityBill = async (req, res) => {
  try {
    const { 
      tenantId, month, year, amount,
      propertyId, roomId, bedId,
      previousReading, currentReading, units, ratePerUnit, fixedCharges,
      dueDate
    } = req.body;
    
    if (!tenantId || !amount) {
      return res.status(400).json({ message: 'Tenant ID and amount are required' });
    }
    
    const tenant = await Tenant.findOne({ tenantId });
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    // Check if this landlord has the tenant in any of their properties
    const hasAccess = tenant.accommodations && tenant.accommodations.some(
      acc => acc.landlordId.toString() === req.user.id && acc.isActive
    );
    
    if (!hasAccess && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'You do not have permission to add bills for this tenant' });
    }
    
    // If property/room/bed specified, verify they exist and belong to the tenant
    if (propertyId) {
      const property = await Property.findOne({ _id: propertyId, landlordId: req.user.id });
      if (!property) {
        return res.status(404).json({ message: 'Property not found or you do not have access' });
      }
      
      // Verify tenant has an accommodation in this property
      const hasPropertyAccommodation = tenant.accommodations && tenant.accommodations.some(
        acc => acc.propertyId.toString() === propertyId && 
              (roomId ? acc.roomId === roomId : true) &&
              (bedId ? acc.bedId === bedId : true) &&
              acc.isActive
      );
      
      if (!hasPropertyAccommodation) {
        return res.status(404).json({ message: 'Tenant does not have an active accommodation in this property' });
      }
    }
    
    // Ensure bills array exists
    if (!tenant.bills) {
      tenant.bills = [];
    }
    
    // Create the bill
    const newBill = {
      landlordId: req.user.id,
      propertyId: propertyId ? mongoose.Types.ObjectId(propertyId) : undefined,
      roomId,
      bedId,
      type: 'Electricity',
      month: month || new Date().toLocaleString('default', { month: 'long' }),
      year: year || new Date().getFullYear().toString(),
      amount,
      dueDate: dueDate || new Date(new Date().setDate(new Date().getDate() + 7)),
      billDetails: {}
    };
    
    // Add bill details if provided
    if (previousReading || currentReading || units || ratePerUnit || fixedCharges) {
      newBill.billDetails = {
        previousReading: previousReading || 0,
        currentReading: currentReading || 0,
        units: units || (currentReading && previousReading ? currentReading - previousReading : 0),
        ratePerUnit: ratePerUnit || 0,
        fixedCharges: fixedCharges || 0
      };
    }
    
    // For backward compatibility
    tenant.electricityBill.push({ month: newBill.month, amount, paid: false });
    
    // Add to the new bills array
    tenant.bills.push(newBill);
    await tenant.save();
    
    // Update cache
    await setCache(`tenant:${tenantId}`, tenant, 3600);
    
    res.status(201).json({ 
      message: 'Electricity bill added successfully',
      bill: newBill
    });
  } catch (error) {
    console.error('Error in addElectricityBill:', error);
    res.status(500).json({ message: 'Error adding electricity bill', error: error.message });
  }
};

/**
 * Get all tenants for the current landlord
 * Including both assigned and unassigned tenants
 */
const getTenants = async (req, res) => {
  try {
    // Get both types of tenants:
    // 1. Tenants who have accommodations with this landlord
    // 2. Tenants who were created but not yet assigned to any property
    
    const tenantsWithAccommodations = await Tenant.find({
      'accommodations.landlordId': req.user.id,
      'accommodations.isActive': true
    });
    
    // Get recently created tenants by this landlord who might not have accommodations yet
    // We'll identify these by looking at tenants created in the last 30 days
    // This is a temporary solution until we add a createdBy field to the Tenant model
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentlyCreatedTenants = await Tenant.find({
      createdAt: { $gte: thirtyDaysAgo },
      accommodations: { $size: 0 }
    });
    
    // Combine both lists
    const allTenants = [...tenantsWithAccommodations];
    
    // Only add recently created tenants if they don't already exist in the list
    recentlyCreatedTenants.forEach(tenant => {
      if (!allTenants.some(t => t._id.toString() === tenant._id.toString())) {
        allTenants.push(tenant);
      }
    });
    
    // Filter accommodations to only show properties from this landlord
    const filteredTenants = allTenants.map(tenant => {
      const tenantObj = tenant.toObject();
      tenantObj.accommodations = tenantObj.accommodations ? tenantObj.accommodations.filter(
        acc => acc.landlordId && acc.landlordId.toString() === req.user.id
      ) : [];
      return tenantObj;
    });
    
    let totalDues = 0, totalCollection = 0;
    filteredTenants.forEach(t => {
      if (t.accommodations) {
        t.accommodations.forEach(a => {
          totalDues += a.pendingDues || 0;
          totalCollection += a.monthlyCollection || 0;
        });
      }
    });
    
    const response = {
      tenants: filteredTenants,
      totalPendingDues: totalDues,
      totalMonthlyCollection: totalCollection
    };
    
    res.status(200).json(response);
  } catch (error) {
    console.error('Error in getTenants:', error);
    res.status(500).json({ message: 'Error fetching tenants', error: error.message });
  }
};

/**
 * Get tenant by ID
 */
const getTenantById = async (req, res) => {
  const { tenantId } = req.params;
  
  try {
    // First try to get from cache
    const cachedTenant = await getCache(`tenant:${tenantId}`);
    if (cachedTenant) {
      // Filter accommodations to only show this landlord's properties
      if (req.user.role === 'landlord') {
        cachedTenant.accommodations = cachedTenant.accommodations ? 
          cachedTenant.accommodations.filter(acc => acc.landlordId.toString() === req.user.id) : [];
      }
      
      // Fix bedId fields and filter inactive accommodations
      const fixedTenant = filterTenantAccommodations(cachedTenant);
      return res.status(200).json({
        success: true,
        tenant: fixedTenant
      });
    }
    
    // Get from database if not in cache
    const tenant = await Tenant.findOne({ tenantId });
    if (!tenant) {
      return res.status(404).json({ 
        success: false,
        message: 'Tenant not found' 
      });
    }
    
    // If landlord, filter accommodations to only show their properties
    if (req.user.role === 'landlord') {
      tenant.accommodations = tenant.accommodations ? 
        tenant.accommodations.filter(acc => acc.landlordId.toString() === req.user.id) : [];
    }
    
    // Fix bedId fields and filter inactive accommodations
    const fixedTenant = filterTenantAccommodations(tenant.toObject());
    
    // Update cache
    await setCache(`tenant:${tenantId}`, fixedTenant, 3600);
    
    res.status(200).json({
      success: true,
      tenant: fixedTenant
    });
  } catch (error) {
    console.error('Error in getTenantById:', error);
    res.status(500).json({ message: 'Error fetching tenant', error: error.message });
  }
};

/**
 * Update tenant information
 */
const updateTenant = async (req, res) => {
  const { tenantId } = req.params;
  const { 
    // Basic tenant information
    name, email, aadhaar, mobile, permanentAddress, work, dob, maritalStatus,
    fatherName, fatherMobile, motherName, motherMobile, photo,
    
    // Property assignment
    propertyId, roomId, bedId, moveInDate, rentAmount, securityDeposit,
    
    // Additional fields requested by client
    moveOutDate,                      // Optional move out date
    noticePeriod,                     // Notice period in days (10, 15, 20, 30, 45, 60)
    agreementPeriod,                  // Agreement period in months (1-12) or years
    agreementPeriodType,              // 'months' or 'years'
    rentOnDate,                       // Rent due date (1-31)
    rentDateOption,                   // 'fixed', 'joining', 'month_end'
    rentalFrequency,                  // Frequency of rent payments
    referredBy,                       // Who referred this tenant
    remarks,                          // Any additional remarks
    bookedBy,                         // How the tenant found the property
    
    // Electricity billing
    electricityPerUnit,               // Cost per unit of electricity
    initialReading,                   // Initial meter reading
    finalReading,                     // Final meter reading
    initialReadingDate,               // Date of initial reading
    finalReadingDate,                 // Date of final reading
    electricityDueDescription,        // Description of electricity dues
    
    // Opening balance details
    openingBalanceStartDate,          // Start date for opening balance calculation
    openingBalanceEndDate,            // End date for opening balance calculation
    openingBalanceAmount              // Pre-calculated opening balance amount
  } = req.body;
  
  try {
    // Find the tenant
    const tenant = await Tenant.findOne({ tenantId });
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    // Check if this landlord has the tenant in any of their properties
    const hasAccess = tenant.accommodations && tenant.accommodations.some(
      acc => acc.landlordId.toString() === req.user.id && acc.isActive
    );
    
    if (!hasAccess && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'You do not have permission to update this tenant' });
    }
    
    // Update basic tenant information
    if (name) tenant.name = name;
    if (email) tenant.email = email;
    if (mobile) tenant.mobile = mobile;
    if (aadhaar) tenant.aadhaar = aadhaar;
    if (permanentAddress) tenant.permanentAddress = permanentAddress;
    if (work) tenant.work = work;
    if (dob) tenant.dob = dob;
    if (maritalStatus) tenant.maritalStatus = maritalStatus;
    if (fatherName) tenant.fatherName = fatherName;
    if (fatherMobile) tenant.fatherMobile = fatherMobile;
    if (motherName) tenant.motherName = motherName;
    if (motherMobile) tenant.motherMobile = motherMobile;
    if (photo) tenant.photo = photo;
    
    // Handle accommodation updates if propertyId and roomId are provided
    if (propertyId && roomId) {
      // Check if the property exists and belongs to this landlord
      const property = await Property.findOne({ 
        _id: propertyId,
        landlordId: req.user.id // Ensure the landlord owns this property
      });
      
      if (!property) {
        return res.status(404).json({ message: 'Property not found or you do not have access' });
      }
      
      // Find the room
      const room = property.rooms.find(r => r.roomId === roomId);
      if (!room) {
        return res.status(404).json({ message: 'Room not found in this property' });
      }
      
      // If updating with a bed, check if the bed exists and is available
      let bed = null;
      if (bedId) {
        bed = room.beds.find(b => b.bedId === bedId);
        if (!bed) {
          return res.status(404).json({ message: 'Bed not found in this room' });
        }
        
        // Check if this tenant already has the same bed assigned
        const alreadyAssigned = tenant.accommodations?.find(acc => 
          acc.propertyId.toString() === propertyId &&
          acc.roomId === roomId &&
          acc.bedId === bedId && 
          acc.isActive === true
        );
        
        // If not already assigned to this tenant, validate availability
        if (!alreadyAssigned) {
          // Validate bed availability using utility function
          const bedValidation = validateBedAvailability(bed);
          if (!bedValidation.isAvailable) {
            return res.status(400).json({ 
              message: bedValidation.message,
              occupiedBy: bedValidation.occupiedBy 
            });
          }
        }
      }
      
      // Validate room capacity if this is a new assignment
      const isNewRoomAssignment = !tenant.accommodations?.some(acc => 
        acc.propertyId.toString() === propertyId && 
        acc.roomId === roomId && 
        acc.isActive === true
      );
      
      if (isNewRoomAssignment) {
        const capacityValidation = validateRoomCapacity(room);
        if (!capacityValidation.hasCapacity) {
          return res.status(400).json({ message: capacityValidation.message });
        }
      }
      
      // Initialize accommodations array if it doesn't exist
      if (!tenant.accommodations) {
        tenant.accommodations = [];
      }
      
      // Find if tenant has any active accommodation in this property
      for (let i = 0; i < tenant.accommodations.length; i++) {
        const acc = tenant.accommodations[i];
        // If tenant has an active accommodation in this property
        if (acc.propertyId.toString() === propertyId && acc.isActive === true) {
          // If not updating to the same room/bed, deactivate the current one
          if (acc.roomId !== roomId || (bedId && acc.bedId !== bedId)) {
            tenant.accommodations[i].isActive = false;
          } 
          // If it's the same room/bed, just update the fields
          else {
            if (moveInDate) acc.moveInDate = moveInDate;
            if (moveOutDate !== undefined) acc.moveOutDate = moveOutDate;
            if (rentAmount) acc.rentAmount = rentAmount;
            if (securityDeposit !== undefined) acc.securityDeposit = securityDeposit;
            if (noticePeriod !== undefined) acc.noticePeriod = noticePeriod;
            if (agreementPeriod !== undefined) acc.agreementPeriod = agreementPeriod;
            if (agreementPeriodType) acc.agreementPeriodType = agreementPeriodType;
            if (rentOnDate !== undefined) acc.rentOnDate = rentOnDate;
            if (rentDateOption) acc.rentDateOption = rentDateOption;
            if (rentalFrequency) acc.rentalFrequency = rentalFrequency;
            if (referredBy !== undefined) acc.referredBy = referredBy;
            if (remarks !== undefined) acc.remarks = remarks;
            if (bookedBy !== undefined) acc.bookedBy = bookedBy;
            
            // Update electricity information
            if (!acc.electricity) acc.electricity = {};
            if (electricityPerUnit !== undefined) acc.electricity.perUnit = electricityPerUnit;
            if (initialReading !== undefined) acc.electricity.initialReading = initialReading;
            if (finalReading !== undefined) acc.electricity.finalReading = finalReading;
            if (initialReadingDate !== undefined) acc.electricity.initialReadingDate = initialReadingDate;
            if (finalReadingDate !== undefined) acc.electricity.finalReadingDate = finalReadingDate;
            if (electricityDueDescription !== undefined) acc.electricity.dueDescription = electricityDueDescription;
            
            // Update opening balance information
            if (!acc.openingBalance) acc.openingBalance = {};
            if (openingBalanceStartDate !== undefined) acc.openingBalance.startDate = openingBalanceStartDate;
            if (openingBalanceEndDate !== undefined) acc.openingBalance.endDate = openingBalanceEndDate;
            if (openingBalanceAmount !== undefined) acc.openingBalance.amount = openingBalanceAmount;
            
            // Found and updated the existing accommodation, no need to add a new one
            tenant.updatedAt = new Date();
            await tenant.save();
            
            // Update cache
            await setCache(`tenant:${tenantId}`, tenant, 3600);
            
            // Get the tenant object
            const tenantObj = tenant.toObject();
            
            // Explicitly format the response to include all required fields
            const responseObj = {
              success: true,
              message: 'Tenant updated successfully',
              tenant: {
                tenantId: tenantObj.tenantId,
                name: tenantObj.name,
                email: tenantObj.email,
                aadhaar: tenantObj.aadhaar,
                mobile: tenantObj.mobile,
                permanentAddress: tenantObj.permanentAddress,
                work: tenantObj.work,
                dob: tenantObj.dob,
                gender: tenantObj.gender,
                maritalStatus: tenantObj.maritalStatus,
                fatherName: tenantObj.fatherName,
                fatherMobile: tenantObj.fatherMobile,
                motherName: tenantObj.motherName,
                motherMobile: tenantObj.motherMobile,
                photo: tenantObj.photo,
                accommodations: tenantObj.accommodations ? tenantObj.accommodations
                  .map(acc => {
                    // Ensure bedId is never null or undefined
                    if (!acc.bedId && acc.bedId !== '') {
                      acc.bedId = '';
                    }
                    return acc;
                  })
                  .filter(acc => acc.isActive === true || (bedId && acc.bedId === bedId)) : [],
                updatedAt: tenantObj.updatedAt
              }
            };
            
            return res.status(200).json(responseObj);
          }
        }
      }
      
      // If we get here, either there was no active accommodation in this property
      // or the previous one was deactivated. Create a new accommodation entry.
      const localTenantId = `L-${req.user.id.toString().substr(-6)}-${Math.random().toString(36).substr(2, 6)}`;
      
      // Create accommodation object with all the fields
      const accommodation = {
        landlordId: req.user.id,
        propertyId: property._id,
        propertyName: property.name,
        roomId,
        bedId: bedId || '', // Ensure bedId is explicitly set to empty string if not provided
        moveInDate: moveInDate || new Date(),
        moveOutDate: moveOutDate || null,
        rentAmount: rentAmount || (bed ? bed.price : room.price),
        securityDeposit: securityDeposit || 0,
        pendingDues: 0,
        monthlyCollection: 0,
        isActive: true,
        securityDepositStatus: 'Pending',
        securityDepositRefundAmount: 0,
        localTenantId,
        // Add the new fields
        noticePeriod: noticePeriod || null,
        agreementPeriod: agreementPeriod || null,
        agreementPeriodType: agreementPeriodType || 'months',
        rentOnDate: rentOnDate || null,
        rentDateOption: rentDateOption || 'fixed',
        rentalFrequency: rentalFrequency || 'Monthly',
        referredBy: referredBy || null,
        remarks: remarks || null,
        bookedBy: bookedBy || null,
        // Electricity billing information
        electricity: {
          perUnit: electricityPerUnit || null,
          initialReading: initialReading || null,
          finalReading: finalReading || null,
          initialReadingDate: initialReadingDate || null,
          finalReadingDate: finalReadingDate || null,
          dueDescription: electricityDueDescription || null
        },
        // Opening balance details
        openingBalance: {
          startDate: openingBalanceStartDate || null,
          endDate: openingBalanceEndDate || null,
          amount: openingBalanceAmount || 0
        }
      };
      
      tenant.accommodations.push(accommodation);
      
      // Update the room/bed status if necessary
      if (bedId && bed) {
        bed.status = 'Not Available';
        const tenantEntry = {
          tenantId: tenant.tenantId,
          name: tenant.name,
          email: tenant.email,
          aadhaar: tenant.aadhaar,
          mobile: tenant.mobile,
          roomId,
          bedId,
          landlordId: req.user.id,
          moveInDate: moveInDate || new Date(),
          moveOutDate: moveOutDate || null,
          rentAmount: rentAmount || bed.price,
          securityDeposit: securityDeposit || 0,
          // Add all the new fields
          noticePeriod: noticePeriod || null,
          agreementPeriod: agreementPeriod || null,
          agreementPeriodType: agreementPeriodType || 'months',
          rentOnDate: rentOnDate || null,
          rentDateOption: rentDateOption || 'fixed',
          rentalFrequency: rentalFrequency || 'Monthly',
          referredBy: referredBy || null,
          remarks: remarks || null,
          bookedBy: bookedBy || null,
          // Electricity billing information
          electricity: {
            perUnit: electricityPerUnit || null,
            initialReading: initialReading || null,
            finalReading: finalReading || null,
            initialReadingDate: initialReadingDate || null,
            finalReadingDate: finalReadingDate || null,
            dueDescription: electricityDueDescription || null
          },
          // Opening balance details
          openingBalance: {
            startDate: openingBalanceStartDate || null,
            endDate: openingBalanceEndDate || null,
            amount: openingBalanceAmount || 0
          }
        };
        
        // Remove any existing tenant entries for this bed
        bed.tenants = bed.tenants.filter(t => t.tenantId !== tenant.tenantId);
        bed.tenants.push(tenantEntry);
        
        // Update the property with the modified bed
        await property.save();
      }
    }
    
    // Save the tenant with updated basic info and/or accommodations
    tenant.updatedAt = new Date();
    await tenant.save();
    
    // Update cache
    await setCache(`tenant:${tenantId}`, tenant, 3600);
    
    // Return the updated tenant with properly filtered accommodations
    // Return full tenant object with all details, not just tenantId and name
    // This ensures the response includes all tenant information
    const tenantObj = tenant.toObject();
    
    // Explicitly format the response to include all required fields
    const responseObj = {
      success: true,
      message: 'Tenant updated successfully',
      tenant: {
        tenantId: tenantObj.tenantId,
        name: tenantObj.name,
        email: tenantObj.email,
        aadhaar: tenantObj.aadhaar,
        mobile: tenantObj.mobile,
        permanentAddress: tenantObj.permanentAddress,
        work: tenantObj.work,
        dob: tenantObj.dob,
        gender: tenantObj.gender,
        maritalStatus: tenantObj.maritalStatus,
        fatherName: tenantObj.fatherName,
        fatherMobile: tenantObj.fatherMobile,
        motherName: tenantObj.motherName,
        motherMobile: tenantObj.motherMobile,
        photo: tenantObj.photo,
        accommodations: tenantObj.accommodations ? tenantObj.accommodations
          .map(acc => {
            // Ensure bedId is never null or undefined
            if (!acc.bedId && acc.bedId !== '') {
              acc.bedId = '';
            }
            return acc;
          })
          .filter(acc => acc.isActive === true || (bedId && acc.bedId === bedId)) : [],
        updatedAt: tenantObj.updatedAt
      }
    };
    
    res.status(200).json(responseObj);
  } catch (error) {
    console.error('Error in updateTenant:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error updating tenant', 
      error: error.message 
    });
  }
};

/**
 * Get all tenants for a specific property
 */
const getTenantsByProperty = async (req, res) => {
  const { propertyId } = req.params;
  
  try {
    // Verify the property belongs to this landlord
    const property = await Property.findOne({ 
      _id: propertyId,
      landlordId: req.user.id
    });
    
    if (!property) {
      return res.status(404).json({ message: 'Property not found or you do not have access' });
    }
    
    // Get all tenants for this property
    const tenants = await Tenant.find({
      'accommodations.propertyId': propertyId,
      'accommodations.isActive': true
    });
    
    // Filter to only show information for this property
    const filteredTenants = tenants.map(tenant => {
      const tenantObj = tenant.toObject();
      tenantObj.accommodations = tenantObj.accommodations ? tenantObj.accommodations.filter(
        acc => acc.propertyId.toString() === propertyId
      ) : [];
      return tenantObj;
    });
    
    res.status(200).json(filteredTenants);
  } catch (error) {
    console.error('Error in getTenantsByProperty:', error);
    res.status(500).json({ message: 'Error fetching property tenants', error: error.message });
  }
};

/**
 * Assign an existing tenant to a new property/room/bed
 */
const assignTenantToProperty = async (req, res) => {
  const { 
    tenantId, propertyId, roomId, bedId, 
    moveInDate, rentAmount, securityDeposit 
  } = req.body;
  
  try {
    // Find the tenant
    const tenant = await Tenant.findOne({ tenantId });
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    // Find the property
    const property = await Property.findOne({ 
      _id: propertyId,
      landlordId: req.user.id
    });
    
    if (!property) {
      return res.status(404).json({ message: 'Property not found or you do not have access' });
    }
    
    // Find the room
    const room = property.rooms.find(r => r.roomId === roomId);
    if (!room) {
      return res.status(404).json({ message: 'Room not found in this property' });
    }
    
    // Generate a landlord-specific tenant ID
    const localTenantId = `L-${req.user.id.toString().substr(-6)}-${Math.random().toString(36).substr(2, 6)}`;
    
    // Check if bed is specified and available
    let bed = null;
    if (bedId) {
      bed = room.beds.find(b => b.bedId === bedId);
      if (!bed) {
        return res.status(404).json({ message: 'Bed not found in this room' });
      }
      
      // Validate bed availability using utility function
      const bedValidation = validateBedAvailability(bed);
      if (!bedValidation.isAvailable) {
        return res.status(400).json({ 
          message: bedValidation.message,
          occupiedBy: bedValidation.occupiedBy 
        });
      }
    }
    
    // Validate room capacity based on room type
    const capacityValidation = validateRoomCapacity(room);
    if (!capacityValidation.hasCapacity) {
      return res.status(400).json({ message: capacityValidation.message });
    }
    
    // Ensure accommodations array exists
    if (!tenant.accommodations) {
      tenant.accommodations = [];
    }
    
    // Check if tenant already has an active accommodation in this property/room/bed
    const existingAccommodation = tenant.accommodations.find(acc => 
      acc.propertyId.toString() === propertyId &&
      acc.roomId === roomId &&
      (bedId ? acc.bedId === bedId : true) &&
      acc.isActive
    );
    
    if (existingAccommodation) {
      return res.status(400).json({ 
        message: 'Tenant is already assigned to this accommodation',
        accommodation: existingAccommodation
      });
    }
    
    // Add accommodation entry to tenant
    tenant.accommodations.push({
      landlordId: req.user.id,
      propertyId: property._id,
      propertyName: property.name,
      roomId,
      bedId,
      moveInDate: moveInDate || new Date(),
      rentAmount: rentAmount || (bed ? bed.price : room.price),
      securityDeposit: securityDeposit || 0,
      isActive: true,
      localTenantId
    });
    
    // Update the room/bed status
    if (bedId && bed) {
      // Add tenant to the bed
      bed.status = 'Not Available';
      const tenantEntry = {
        tenantId: tenant.tenantId,
        name: tenant.name,
        email: tenant.email,
        aadhaar: tenant.aadhaar,
        mobile: tenant.mobile,
        roomId,
        bedId,
        landlordId: req.user.id
      };
      bed.tenants.push(tenantEntry);
    } else {
      // Add tenant directly to the room if no bed is specified
      room.tenants.push({
        tenantId: tenant.tenantId,
        name: tenant.name,
        email: tenant.email,
        aadhaar: tenant.aadhaar,
        mobile: tenant.mobile,
        roomId,
        landlordId: req.user.id
      });
    }
    
    // Update occupancy statistics
    if (!property.occupiedSpace) property.occupiedSpace = 0;
    property.occupiedSpace += 1;
    
    await property.save();
    await tenant.save();
    
    // Update cache
    await setCache(`tenant:${tenant.tenantId}`, tenant, 3600);
    
    res.status(200).json({ 
      message: 'Tenant assigned to property successfully',
      accommodation: tenant.accommodations[tenant.accommodations.length - 1]
    });
  } catch (error) {
    console.error('Error in assignTenantToProperty:', error);
    res.status(500).json({ message: 'Error assigning tenant to property', error: error.message });
  }
};

/**
 * Add any type of bill for a tenant (more flexible than addElectricityBill)
 */
const addTenantBill = async (req, res) => {
  const { tenantId } = req.params;
  const { 
    type, amount, month, year, dueDate, propertyId, roomId, bedId,
    billDetails
  } = req.body;
  
  try {
    if (!type || !amount) {
      return res.status(400).json({ message: 'Bill type and amount are required' });
    }
    
    const tenant = await Tenant.findOne({ tenantId });
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    // Check if this landlord has the tenant in any of their properties
    const hasAccess = tenant.accommodations && tenant.accommodations.some(
      acc => acc.landlordId.toString() === req.user.id && acc.isActive
    );
    
    if (!hasAccess && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'You do not have permission to add bills for this tenant' });
    }
    
    // Ensure bills array exists
    if (!tenant.bills) {
      tenant.bills = [];
    }
    
    // Create the bill
    const newBill = {
      landlordId: req.user.id,
      type,
      amount,
      month: month || new Date().toLocaleString('default', { month: 'long' }),
      year: year || new Date().getFullYear().toString(),
      dueDate: dueDate ? new Date(dueDate) : new Date(new Date().setDate(new Date().getDate() + 7))
    };
    
    // Add property details if provided
    if (propertyId) {
      newBill.propertyId = mongoose.Types.ObjectId(propertyId);
      newBill.roomId = roomId;
      newBill.bedId = bedId;
    }
    
    // Add bill details if provided
    if (billDetails) {
      newBill.billDetails = billDetails;
    }
    
    tenant.bills.push(newBill);
    await tenant.save();
    
    // Update cache
    await setCache(`tenant:${tenantId}`, tenant, 3600);
    
    res.status(201).json({ 
      message: 'Bill added successfully',
      bill: newBill
    });
  } catch (error) {
    console.error('Error in addTenantBill:', error);
    res.status(500).json({ message: 'Error adding bill', error: error.message });
  }
};

/**
 * Get all bills for a tenant
 */
const getTenantBills = async (req, res) => {
  const { tenantId } = req.params;
  const { propertyId, roomId, bedId, billType, isPaid } = req.query;
  
  try {
    const tenant = await Tenant.findOne({ tenantId });
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    // Check if this landlord has the tenant in any of their properties
    const hasAccess = tenant.accommodations && tenant.accommodations.some(
      acc => acc.landlordId.toString() === req.user.id && acc.isActive
    );
    
    if (!hasAccess && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'You do not have permission to view bills for this tenant' });
    }
    
    // Filter bills to only show ones added by this landlord
    let bills = tenant.bills ? tenant.bills.filter(bill => bill.landlordId.toString() === req.user.id) : [];
    
    // Apply additional filters based on query parameters
    if (propertyId) {
      bills = bills.filter(bill => bill.propertyId && bill.propertyId.toString() === propertyId);
    }
    
    if (roomId) {
      bills = bills.filter(bill => bill.roomId === roomId);
    }
    
    if (bedId) {
      bills = bills.filter(bill => bill.bedId === bedId);
    }
    
    if (billType) {
      bills = bills.filter(bill => bill.type === billType);
    }
    
    // Handle isPaid parameter (convert to boolean)
    if (isPaid !== undefined) {
      const paidStatus = isPaid.toLowerCase() === 'true' || isPaid.toLowerCase() === 'yes';
      bills = bills.filter(bill => bill.paid === paidStatus);
    }
    
    // Sort bills by created date (most recent first)
    bills.sort((a, b) => (b.createdAt || new Date()) - (a.createdAt || new Date()));
    
    res.status(200).json({
      success: true,
      count: bills.length,
      bills: bills
    });
  } catch (error) {
    console.error('Error in getTenantBills:', error);
    res.status(500).json({ message: 'Error fetching tenant bills', error: error.message });
  }
};

/**
 * Get all outstanding dues for a tenant
 */
const getTenantDues = async (req, res) => {
  const { tenantId } = req.params;
  
  try {
    const tenant = await Tenant.findOne({ tenantId });
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    // Check if this landlord has the tenant in any of their properties
    const hasAccess = tenant.accommodations && tenant.accommodations.some(
      acc => acc.landlordId.toString() === req.user.id && acc.isActive
    );
    
    if (!hasAccess && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'You do not have permission to view dues for this tenant' });
    }
    
    // Filter bills to only show unpaid ones added by this landlord
    const unpaidBills = tenant.bills ? 
      tenant.bills.filter(bill => bill.landlordId.toString() === req.user.id && !bill.paid) : [];
    
    // Get the accommodation dues
    const accommodationDues = tenant.accommodations ?
      tenant.accommodations
        .filter(acc => acc.landlordId.toString() === req.user.id && acc.isActive)
        .map(acc => ({
          propertyId: acc.propertyId,
          propertyName: acc.propertyName,
          roomId: acc.roomId,
          bedId: acc.bedId,
          pendingDues: acc.pendingDues || 0
        })) : [];
    
    // Calculate total dues
    const totalBillsDue = unpaidBills.reduce((sum, bill) => sum + bill.amount, 0);
    const totalAccommodationDues = accommodationDues.reduce((sum, acc) => sum + acc.pendingDues, 0);
    const totalDue = totalBillsDue + totalAccommodationDues;
    
    res.status(200).json({
      tenantId,
      name: tenant.name,
      unpaidBills,
      accommodationDues,
      summary: {
        totalBillsDue,
        totalAccommodationDues,
        totalDue
      }
    });
  } catch (error) {
    console.error('Error in getTenantDues:', error);
    res.status(500).json({ message: 'Error fetching tenant dues', error: error.message });
  }
};

/**
 * Remove a tenant from a property
 * This function updates the tenant's accommodation record to mark it as inactive
 */
const removeTenantFromProperty = async (req, res) => {
  const { tenantId, propertyId, roomId, bedId, moveOutDate } = req.body;
  
  if (!tenantId || !propertyId) {
    return res.status(400).json({ 
      success: false,
      message: 'Tenant ID and Property ID are required' 
    });
  }

  try {
    // Use findOne with tenantId instead of findById since tenantId is a string, not an ObjectId
    const tenant = await Tenant.findOne({ tenantId });
    
    if (!tenant) {
      return res.status(404).json({ 
        success: false,
        message: 'Tenant not found' 
      });
    }
    
    // Find the active accommodation matching the criteria
    const accIndex = tenant.accommodations.findIndex(
      acc => 
        acc.propertyId.toString() === propertyId &&
        (roomId ? acc.roomId.toString() === roomId : true) &&
        (bedId ? acc.bedId.toString() === bedId : true) &&
        acc.isActive
    );
    
    if (accIndex === -1) {
      return res.status(404).json({ 
        message: 'Active accommodation not found for this tenant at the specified property' 
      });
    }
    
    // Update the accommodation to mark it as inactive
    tenant.accommodations[accIndex].isActive = false;
    tenant.accommodations[accIndex].moveOutDate = moveOutDate || new Date();
    
    // Also update the property/room/bed status
    try {
      // Find the property to update room/bed status
      const property = await Property.findById(propertyId);
      if (property) {
        // Find the specific room
        const room = property.rooms.find(r => r.roomId === roomId);
        if (room) {
          // If we have a bed, find it and mark it as available
          if (bedId) {
            const bed = room.beds.find(b => b.bedId === bedId);
            if (bed) {
              // Mark the bed as available
              bed.status = 'Available';
              // Remove tenant from bed
              bed.tenants = bed.tenants.filter(t => t.tenantId !== tenantId);
            }
          } else {
            // If no bed, just remove tenant from room
            room.tenants = room.tenants.filter(t => t.tenantId !== tenantId);
          }
          
          // Update property occupancy stats
          if (property.occupiedSpace && property.occupiedSpace > 0) {
            property.occupiedSpace -= 1;
          }
          
          // Save property changes
          await property.save();
        }
      }
    } catch (propertyError) {
      // Log property update error but continue with tenant update
      console.error('Error updating property after tenant removal:', propertyError);
    }
    
    // Save tenant changes
    await tenant.save();
    
    // Clear cache
    await setCache(`landlord:tenants:${req.user.id}`, null, 1);
    await setCache(`property:tenants:${propertyId}`, null, 1);
    await setCache(`tenant:${tenantId}`, null, 1);
    
    res.status(200).json({
      success: true,
      message: 'Tenant removed from property successfully',
      tenantId,
      propertyId,
      roomId,
      bedId,
      moveOutDate: tenant.accommodations[accIndex].moveOutDate
    });
  } catch (error) {
    console.error('Error removing tenant from property:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error', 
      error: error.message 
    });
  }
};

/**
 * Helper function to filter tenant accommodations and fix bedId fields
 * @param {Object} tenant - Tenant object
 * @param {string} targetBedId - Specific bedId to include even if inactive (optional)
 * @returns {Object} - Filtered tenant object
 */
function filterTenantAccommodations(tenant, targetBedId = null) {
  if (tenant.accommodations && Array.isArray(tenant.accommodations)) {
    // Fix bedId field in all accommodations
    tenant.accommodations = tenant.accommodations.map(acc => {
      // Ensure bedId is never null or undefined
      if (!acc.bedId && acc.bedId !== '') {
        acc.bedId = '';
      }
      return acc;
    });
    
    // Filter accommodations to only return active ones or those with the targetBedId
    if (targetBedId) {
      tenant.accommodations = tenant.accommodations.filter(acc => 
        acc.isActive === true || acc.bedId === targetBedId
      );
    } else {
      tenant.accommodations = tenant.accommodations.filter(acc => acc.isActive === true);
    }
  }
  
  return tenant;
}

module.exports = { 
  addTenant, 
  addElectricityBill, 
  getTenants,
  getTenantById,
  updateTenant,
  getTenantsByProperty,
  addTenantBill,
  getTenantBills,
  getTenantDues,
  assignTenantToProperty,
  removeTenantFromProperty
};