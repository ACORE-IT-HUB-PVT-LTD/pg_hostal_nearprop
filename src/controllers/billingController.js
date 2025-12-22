const Tenant = require('../models/Tenant');
const Property = require('../models/Property');
const mongoose = require('mongoose');
const { setCache, getCache } = require('../utils/redis');

/**
 * Add an electricity bill for a tenant
 * This function supports adding a bill with detailed information
 */
const addElectricityBill = async (req, res) => {
  const {
    tenantId, propertyId, roomId, bedId,
    month, year, amount, dueDate,
    previousReading, currentReading, units, ratePerUnit, fixedCharges,
    rentDue, actualRent, description, billDate, billNumber,
    waterCharges, maintenanceCharges, otherCharges, remarks,
    penaltyAmount, penaltyReason
  } = req.body;
  
  if (!tenantId) {
    return res.status(400).json({ message: 'Tenant ID is required' });
  }
  
  // Make sure at least an amount or readings are provided
  if (!amount && !(currentReading && previousReading)) {
    return res.status(400).json({ message: 'Either amount or both readings (previousReading and currentReading) are required' });
  }
  
  try {
    const isLocalId = tenantId.startsWith('L-');
    let tenant;
    
    console.log(`Searching for tenant with ID: ${tenantId}, isLocalId: ${isLocalId}`);
    
    // Find the tenant
    if (isLocalId) {
      tenant = await Tenant.findOne({
        'accommodations.localTenantId': tenantId,
        'accommodations.landlordId': req.user.id
      });
    } else {
      tenant = await Tenant.findOne({
        tenantId,
        'accommodations.landlordId': req.user.id
      });
      
      // If not found, try more flexible search without the landlord filter
      if (!tenant) {
        tenant = await Tenant.findOne({ tenantId });
        console.log(`Flexible tenant search result: ${tenant ? 'Found' : 'Not found'}`);
      }
    }
    
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found or you do not have access' });
    }
    
    // Find property if provided
    let property = null;
    if (propertyId) {
      property = await Property.findOne({
        _id: propertyId,
        landlordId: req.user.id
      });
      
      if (!property) {
        return res.status(404).json({ message: 'Property not found or you do not have access' });
      }
    } else {
      // Use the first active accommodation if propertyId not provided
      const firstAccommodation = tenant.accommodations.find(
        acc => acc.landlordId.toString() === req.user.id.toString() && acc.isActive
      );
      
      if (!firstAccommodation) {
        return res.status(404).json({ message: 'No active accommodations found for this tenant' });
      }
      
      property = await Property.findOne({ _id: firstAccommodation.propertyId });
      if (!property) {
        return res.status(404).json({ message: 'Property not found' });
      }
    }
    
    // Create bill object
    const newBill = {
      landlordId: req.user.id,
      propertyId: property._id,
      propertyName: property.name,
      roomId: roomId || (tenant.accommodations[0] && tenant.accommodations[0].roomId),
      bedId: bedId || (tenant.accommodations[0] && tenant.accommodations[0].bedId),
      type: 'Electricity',
      month: month || new Date().toLocaleString('default', { month: 'long' }),
      year: year || new Date().getFullYear().toString(),
      amount: amount || 0,
      dueDate: dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Default: 7 days from now
      paid: false,
      description: description || `Electricity Bill for ${month || new Date().toLocaleString('default', { month: 'long' })} ${year || new Date().getFullYear()}`,
      billDate: billDate || new Date(),
      billNumber: billNumber || `EB-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
      billDetails: {
        previousReading,
        currentReading,
        units: units || (currentReading && previousReading ? currentReading - previousReading : null),
        ratePerUnit,
        fixedCharges,
        dueAmount: amount || 0,
        rentDue: rentDue || 0,
        actualRent: actualRent || 0,
        waterCharges: waterCharges || 0,
        maintenanceCharges: maintenanceCharges || 0,
        otherCharges: otherCharges || 0,
        remarks: remarks || '',
        penaltyAmount: penaltyAmount || 0,
        penaltyReason: penaltyReason || ''
      }
    };
    
    // Add bill to tenant
    tenant.bills.push(newBill);
    await tenant.save();
    
    // Update tenant's pendingDues in accommodations
    const accommodationIndex = tenant.accommodations.findIndex(
      acc => acc.propertyId.toString() === property._id.toString() && 
             (roomId ? acc.roomId === roomId : true) &&
             (bedId ? acc.bedId === bedId : true) &&
             acc.isActive
    );
    
    if (accommodationIndex !== -1) {
      tenant.accommodations[accommodationIndex].pendingDues += amount;
      await tenant.save();
    }
    
    // Clear cache
    await setCache(`landlord:tenants:${req.user.id}`, null, 1);
    
    return res.status(201).json({
      message: 'Electricity bill added successfully',
      bill: newBill
    });
  } catch (error) {
    console.error('Error in addElectricityBill:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Add any type of bill for a tenant (more flexible than addElectricityBill)
 */
const addTenantBill = async (req, res) => {
  // Get tenantId from URL params if available, otherwise from request body
  const paramTenantId = req.params.tenantId;
  const {
    tenantId: bodyTenantId, propertyId, roomId, bedId,
    type, month, year, amount, dueDate,
    previousReading, currentReading, units, ratePerUnit, fixedCharges,
    rentDue, actualRent, description, billDate, billNumber,
    waterCharges, maintenanceCharges, otherCharges, remarks,
    penaltyAmount, penaltyReason, billDetails
  } = req.body;
  
  // Use tenantId from params if available, otherwise from body
  const tenantId = paramTenantId || bodyTenantId;
  
  if (!tenantId || !type) {
    return res.status(400).json({ message: 'Tenant ID and Bill Type are required' });
  }
  
  try {
    const isLocalId = tenantId.startsWith('L-');
    let tenant;
    
    // Find the tenant
    if (isLocalId) {
      tenant = await Tenant.findOne({
        'accommodations.localTenantId': tenantId,
        'accommodations.landlordId': req.user.id
      });
    } else {
      tenant = await Tenant.findOne({
        tenantId,
        'accommodations.landlordId': req.user.id
      });
    }
    
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found or you do not have access' });
    }
    
    // Find the accommodation
    let propertyDetails;
    let accommodationDetails;
    
    if (propertyId) {
      // Verify property belongs to this landlord
      propertyDetails = await Property.findOne({
        _id: propertyId,
        landlordId: req.user.id
      });
      
      if (!propertyDetails) {
        return res.status(404).json({ message: 'Property not found or you do not have access' });
      }
      
      // Find the accommodation entry for this property
      accommodationDetails = tenant.accommodations.find(
        acc => acc.propertyId.toString() === propertyId.toString() &&
               (roomId ? acc.roomId === roomId : true) &&
               (bedId ? acc.bedId === bedId : true) &&
               acc.isActive
      );
    } else {
      // Use the first active accommodation
      accommodationDetails = tenant.accommodations.find(
        acc => acc.landlordId.toString() === req.user.id.toString() && acc.isActive
      );
      
      if (accommodationDetails) {
        propertyDetails = await Property.findOne({ _id: accommodationDetails.propertyId });
      }
    }
    
    if (!accommodationDetails || !propertyDetails) {
      return res.status(404).json({ message: 'No active accommodation found for this tenant' });
    }
    
    // Create bill object
    const newBill = {
      landlordId: req.user.id,
      propertyId: accommodationDetails.propertyId,
      propertyName: propertyDetails.name,
      roomId: roomId || accommodationDetails.roomId,
      bedId: bedId || accommodationDetails.bedId,
      type,
      month: month || new Date().toLocaleString('default', { month: 'long' }),
      year: year || new Date().getFullYear().toString(),
      amount: amount || 0,
      dueDate: dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Default: 7 days from now
      paid: false,
      description: description || `${type} Bill`,
      billDate: billDate || new Date(),
      billNumber: billNumber || `${type.substring(0,2).toUpperCase()}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
      billDetails: billDetails || {
        previousReading,
        currentReading,
        units: units || (currentReading && previousReading ? currentReading - previousReading : null),
        ratePerUnit,
        fixedCharges,
        dueAmount: amount || 0,
        rentDue: rentDue || 0,
        actualRent: actualRent || 0,
        waterCharges: waterCharges || 0,
        maintenanceCharges: maintenanceCharges || 0,
        otherCharges: otherCharges || 0,
        remarks: remarks || '',
        penaltyAmount: penaltyAmount || 0,
        penaltyReason: penaltyReason || ''
      }
    };
    
    // Add bill to tenant
    tenant.bills.push(newBill);
    
    // Update tenant's pendingDues in accommodations
    const accommodationIndex = tenant.accommodations.findIndex(
      acc => acc.propertyId.toString() === accommodationDetails.propertyId.toString() &&
             acc.roomId === (roomId || accommodationDetails.roomId) &&
             (bedId ? acc.bedId === bedId : true) &&
             acc.isActive
    );
    
    if (accommodationIndex !== -1) {
      tenant.accommodations[accommodationIndex].pendingDues += amount;
    }
    
    await tenant.save();
    
    // Clear cache
    await setCache(`landlord:tenants:${req.user.id}`, null, 1);
    
    return res.status(201).json({
      message: 'Bill added successfully',
      bill: newBill
    });
  } catch (error) {
    console.error('Error in addTenantBill:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get all bills for a tenant
 */
const getTenantBills = async (req, res) => {
  const { tenantId } = req.params;
  const { propertyId, roomId, bedId, billType, isPaid } = req.query;
  
  try {
    const isLocalId = tenantId.startsWith('L-');
    let tenant;
    
    // Find tenant
    if (isLocalId) {
      tenant = await Tenant.findOne({
        'accommodations.localTenantId': tenantId,
        'accommodations.landlordId': req.user.id
      });
    } else {
      tenant = await Tenant.findOne({
        tenantId,
        'accommodations.landlordId': req.user.id
      });
    }
    
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found or you do not have access' });
    }
    
    // Filter bills
    let bills = tenant.bills.filter(bill => 
      bill.landlordId.toString() === req.user.id.toString()
    );
    
    // Apply additional filters if provided
    if (propertyId) {
      bills = bills.filter(bill => bill.propertyId.toString() === propertyId);
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
    
    if (isPaid !== undefined) {
      const paidStatus = isPaid === 'true' || isPaid === true;
      bills = bills.filter(bill => bill.paid === paidStatus);
    }
    
    // Sort bills by dueDate (most recent first)
    bills.sort((a, b) => new Date(b.dueDate) - new Date(a.dueDate));
    
    return res.status(200).json(bills);
  } catch (error) {
    console.error('Error in getTenantBills:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get all outstanding dues for a tenant
 */
const getTenantDues = async (req, res) => {
  const { tenantId } = req.params;
  const { propertyId } = req.query;
  
  try {
    const isLocalId = tenantId.startsWith('L-');
    let tenant;
    
    // Find tenant
    if (isLocalId) {
      tenant = await Tenant.findOne({
        'accommodations.localTenantId': tenantId,
        'accommodations.landlordId': req.user.id
      });
    } else {
      tenant = await Tenant.findOne({
        tenantId,
        'accommodations.landlordId': req.user.id
      });
    }
    
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found or you do not have access' });
    }
    
    // Get unpaid bills
    let unpaidBills = tenant.bills.filter(bill => 
      bill.landlordId.toString() === req.user.id.toString() && 
      !bill.paid
    );
    
    if (propertyId) {
      unpaidBills = unpaidBills.filter(bill => bill.propertyId.toString() === propertyId);
    }
    
    // Group dues by type
    const duesByType = {};
    unpaidBills.forEach(bill => {
      if (!duesByType[bill.type]) {
        duesByType[bill.type] = 0;
      }
      duesByType[bill.type] += bill.amount;
    });
    
    // Calculate total dues
    const totalDues = unpaidBills.reduce((sum, bill) => sum + bill.amount, 0);
    
    // Get accommodations for this tenant under this landlord
    let accommodations = tenant.accommodations.filter(acc => 
      acc.landlordId.toString() === req.user.id.toString() && 
      acc.isActive
    );
    
    if (propertyId) {
      accommodations = accommodations.filter(acc => acc.propertyId.toString() === propertyId);
    }
    
    // Group accommodations by property
    const groupedAccommodations = {};
    for (const acc of accommodations) {
      const propId = acc.propertyId.toString();
      if (!groupedAccommodations[propId]) {
        groupedAccommodations[propId] = {
          propertyId: propId,
          propertyName: acc.propertyName,
          totalDues: acc.pendingDues,
          rooms: []
        };
      }
      
      groupedAccommodations[propId].rooms.push({
        roomId: acc.roomId,
        bedId: acc.bedId,
        rentAmount: acc.rentAmount,
        pendingDues: acc.pendingDues
      });
    }
    
    return res.status(200).json({
      totalDues,
      duesByType,
      unpaidBills,
      accommodations: Object.values(groupedAccommodations)
    });
  } catch (error) {
    console.error('Error in getTenantDues:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Record payment for a bill
 */
const recordBillPayment = async (req, res) => {
  const { tenantId, billIds, paidAmount, paymentDate } = req.body;
  
  if (!tenantId || !billIds || !paidAmount) {
    return res.status(400).json({ message: 'Tenant ID, Bill IDs, and Paid Amount are required' });
  }
  
  try {
    const isLocalId = tenantId.startsWith('L-');
    let tenant;
    
    // Find tenant
    if (isLocalId) {
      tenant = await Tenant.findOne({
        'accommodations.localTenantId': tenantId,
        'accommodations.landlordId': req.user.id
      });
    } else {
      tenant = await Tenant.findOne({
        tenantId,
        'accommodations.landlordId': req.user.id
      });
    }
    
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found or you do not have access' });
    }
    
    // Convert billIds to array if it's a single value
    const billIdArray = Array.isArray(billIds) ? billIds : [billIds];
    
    // Update bills
    const updatedBills = [];
    let totalPaidAmount = 0;
    let propertyAccommodations = new Map();
    
    for (const billId of billIdArray) {
      const billIndex = tenant.bills.findIndex(
        bill => bill._id.toString() === billId &&
               bill.landlordId.toString() === req.user.id.toString()
      );
      
      if (billIndex !== -1) {
        const bill = tenant.bills[billIndex];
        const billAmount = bill.amount;
        
        // Update bill
        bill.paid = true;
        bill.paidDate = paymentDate || new Date();
        bill.paidAmount = billAmount;
        
        totalPaidAmount += billAmount;
        updatedBills.push(bill);
        
        // Track which properties need accommodation updates
        const key = `${bill.propertyId}-${bill.roomId}-${bill.bedId || ''}`;
        if (!propertyAccommodations.has(key)) {
          propertyAccommodations.set(key, {
            propertyId: bill.propertyId,
            roomId: bill.roomId,
            bedId: bill.bedId,
            amount: billAmount
          });
        } else {
          propertyAccommodations.get(key).amount += billAmount;
        }
      }
    }
    
    // Update accommodations
    for (const [_, details] of propertyAccommodations) {
      const accIndex = tenant.accommodations.findIndex(
        acc => acc.propertyId.toString() === details.propertyId.toString() &&
               acc.roomId === details.roomId &&
               (details.bedId ? acc.bedId === details.bedId : true) &&
               acc.isActive
      );
      
      if (accIndex !== -1) {
        tenant.accommodations[accIndex].pendingDues -= details.amount;
        tenant.accommodations[accIndex].monthlyCollection += details.amount;
      }
    }
    
    await tenant.save();
    
    // Clear cache
    await setCache(`landlord:tenants:${req.user.id}`, null, 1);
    
    return res.status(200).json({
      message: 'Payment recorded successfully',
      paidAmount: totalPaidAmount,
      paidBills: updatedBills.length,
      paymentDate: paymentDate || new Date()
    });
  } catch (error) {
    console.error('Error in recordBillPayment:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  addElectricityBill,
  addTenantBill,
  getTenantBills,
  getTenantDues,
  recordBillPayment
};
