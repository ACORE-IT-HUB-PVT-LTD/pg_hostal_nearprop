const Tenant = require('../models/Tenant');
const Property = require('../models/Property');
const mongoose = require('mongoose');
const { setCache, getCache } = require('../utils/redis');

/**
 * Get all tenant dues for a landlord
 * Can be filtered by property, month, year, and due type
 */
const getAllTenantDues = async (req, res) => {
  const { propertyId, month, year, dueType, isPaid } = req.query;

  try {
    // Find all tenants associated with this landlord
    const tenants = await Tenant.find({
      'accommodations.landlordId': req.user.id,
      'accommodations.isActive': true
    });

    if (!tenants || tenants.length === 0) {
      return res.status(200).json({
        message: 'No active tenants found',
        dues: []
      });
    }

    // Get all properties owned by this landlord
    const properties = await Property.find({
      landlordId: req.user.id
    });

    const propertyMap = {};
    properties.forEach(property => {
      propertyMap[property._id.toString()] = property.name;
    });

    // Prepare response object
    let totalDueAmount = 0;
    const duesByProperty = {};
    const duesByType = {};
    const duesByMonth = {};
    const allDues = [];

    // Process each tenant
    for (const tenant of tenants) {
      // Filter bills by property if specified
      let bills = tenant.bills.filter(bill => 
        bill.landlordId.toString() === req.user.id.toString() &&
        (isPaid !== undefined ? bill.paid === (isPaid === 'true') : true) &&
        (dueType ? bill.type === dueType : true) &&
        (month ? bill.month === month : true) &&
        (year ? bill.year === year : true)
      );

      if (propertyId) {
        bills = bills.filter(bill => bill.propertyId.toString() === propertyId);
      }

      // Process filtered bills
      for (const bill of bills) {
        const propId = bill.propertyId.toString();
        const propName = propertyMap[propId] || 'Unknown Property';
        const billMonth = `${bill.month} ${bill.year}`;
        const billType = bill.type;
        
        // Initialize property in dues map if not exists
        if (!duesByProperty[propId]) {
          duesByProperty[propId] = {
            propertyId: propId,
            propertyName: propName,
            totalDue: 0,
            unpaidDue: 0,
            paidDue: 0,
            bills: []
          };
        }

        // Initialize type in dues map if not exists
        if (!duesByType[billType]) {
          duesByType[billType] = {
            type: billType,
            totalDue: 0,
            unpaidDue: 0,
            paidDue: 0,
            bills: []
          };
        }

        // Initialize month in dues map if not exists
        if (!duesByMonth[billMonth]) {
          duesByMonth[billMonth] = {
            month: billMonth,
            totalDue: 0,
            unpaidDue: 0,
            paidDue: 0,
            bills: []
          };
        }

        // Update total due amount
        totalDueAmount += bill.amount;
        
        // Update property dues
        duesByProperty[propId].totalDue += bill.amount;
        if (bill.paid) {
          duesByProperty[propId].paidDue += bill.amount;
        } else {
          duesByProperty[propId].unpaidDue += bill.amount;
        }
        
        // Update type dues
        duesByType[billType].totalDue += bill.amount;
        if (bill.paid) {
          duesByType[billType].paidDue += bill.amount;
        } else {
          duesByType[billType].unpaidDue += bill.amount;
        }
        
        // Update month dues
        duesByMonth[billMonth].totalDue += bill.amount;
        if (bill.paid) {
          duesByMonth[billMonth].paidDue += bill.amount;
        } else {
          duesByMonth[billMonth].unpaidDue += bill.amount;
        }

        // Add bill to array with tenant info
        const tenantAccommodation = tenant.accommodations.find(
          acc => acc.propertyId.toString() === propId && acc.isActive
        );

        const billDetails = {
          billId: bill._id,
          tenantId: tenant.tenantId,
          tenantName: tenant.name,
          propertyId: bill.propertyId,
          propertyName: propName,
          roomId: bill.roomId || (tenantAccommodation && tenantAccommodation.roomId),
          bedId: bill.bedId || (tenantAccommodation && tenantAccommodation.bedId),
          type: bill.type,
          month: bill.month,
          year: bill.year,
          amount: bill.amount,
          dueDate: bill.dueDate,
          paid: bill.paid,
          paidDate: bill.paidDate,
          billNumber: bill.billNumber,
          description: bill.description
        };

        // Add to property bills
        duesByProperty[propId].bills.push(billDetails);
        
        // Add to type bills
        duesByType[billType].bills.push(billDetails);
        
        // Add to month bills
        duesByMonth[billMonth].bills.push(billDetails);
        
        // Add to all dues
        allDues.push(billDetails);
      }
    }

    return res.status(200).json({
      totalDueAmount,
      duesByProperty: Object.values(duesByProperty),
      duesByType: Object.values(duesByType),
      duesByMonth: Object.values(duesByMonth),
      allDues
    });
  } catch (error) {
    console.error('Error in getAllTenantDues:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get monthly collections by property
 * Can be filtered by property, month, and year
 */
const getMonthlyCollections = async (req, res) => {
  const { propertyId, month, year } = req.query;

  try {
    // Find all tenants with paid bills for this landlord
    const tenants = await Tenant.find({
      'accommodations.landlordId': req.user.id,
      'bills.landlordId': req.user.id,
      'bills.paid': true
    });

    if (!tenants || tenants.length === 0) {
      return res.status(200).json({
        message: 'No collections found',
        collections: []
      });
    }

    // Get all properties owned by this landlord
    const properties = await Property.find({
      landlordId: req.user.id
    });

    const propertyMap = {};
    properties.forEach(property => {
      propertyMap[property._id.toString()] = property.name;
    });

    // Prepare response object
    let totalCollectionAmount = 0;
    const collectionsByProperty = {};
    const collectionsByMonth = {};
    const collectionsByType = {};
    const allCollections = [];

    // Process each tenant
    for (const tenant of tenants) {
      // Filter bills by property, month, year and paid status
      let paidBills = tenant.bills.filter(bill => 
        bill.landlordId.toString() === req.user.id.toString() &&
        bill.paid === true &&
        (month ? bill.month === month : true) &&
        (year ? bill.year === year : true)
      );

      if (propertyId) {
        paidBills = paidBills.filter(bill => bill.propertyId.toString() === propertyId);
      }

      // Process filtered bills
      for (const bill of paidBills) {
        const propId = bill.propertyId.toString();
        const propName = propertyMap[propId] || 'Unknown Property';
        const billMonth = `${bill.month} ${bill.year}`;
        const billType = bill.type;
        
        // Initialize property in collections map if not exists
        if (!collectionsByProperty[propId]) {
          collectionsByProperty[propId] = {
            propertyId: propId,
            propertyName: propName,
            totalCollection: 0,
            bills: []
          };
        }

        // Initialize month in collections map if not exists
        if (!collectionsByMonth[billMonth]) {
          collectionsByMonth[billMonth] = {
            month: billMonth,
            totalCollection: 0,
            bills: []
          };
        }

        // Initialize type in collections map if not exists
        if (!collectionsByType[billType]) {
          collectionsByType[billType] = {
            type: billType,
            totalCollection: 0,
            bills: []
          };
        }

        // Update total collection amount
        totalCollectionAmount += bill.amount;
        
        // Update property collections
        collectionsByProperty[propId].totalCollection += bill.amount;
        
        // Update month collections
        collectionsByMonth[billMonth].totalCollection += bill.amount;
        
        // Update type collections
        collectionsByType[billType].totalCollection += bill.amount;

        // Add bill to array with tenant info
        const tenantAccommodation = tenant.accommodations.find(
          acc => acc.propertyId.toString() === propId && acc.isActive
        );

        const collectionDetails = {
          billId: bill._id,
          tenantId: tenant.tenantId,
          tenantName: tenant.name,
          propertyId: bill.propertyId,
          propertyName: propName,
          roomId: bill.roomId || (tenantAccommodation && tenantAccommodation.roomId),
          bedId: bill.bedId || (tenantAccommodation && tenantAccommodation.bedId),
          type: bill.type,
          month: bill.month,
          year: bill.year,
          amount: bill.amount,
          paidDate: bill.paidDate,
          billNumber: bill.billNumber,
          description: bill.description
        };

        // Add to property collections
        collectionsByProperty[propId].bills.push(collectionDetails);
        
        // Add to month collections
        collectionsByMonth[billMonth].bills.push(collectionDetails);
        
        // Add to type collections
        collectionsByType[billType].bills.push(collectionDetails);
        
        // Add to all collections
        allCollections.push(collectionDetails);
      }
    }

    return res.status(200).json({
      totalCollectionAmount,
      collectionsByProperty: Object.values(collectionsByProperty),
      collectionsByMonth: Object.values(collectionsByMonth),
      collectionsByType: Object.values(collectionsByType),
      allCollections
    });
  } catch (error) {
    console.error('Error in getMonthlyCollections:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  getAllTenantDues,
  getMonthlyCollections
};
