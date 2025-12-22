const mongoose = require('mongoose');
const Property = require('../models/Property');
const Payment = require('../models/Payment');
const Tenant = require('../models/Tenant');
const { setCache, getCache } = require('../utils/redis');
const moment = require('moment');

/**
 * Get collection summary for all properties
 * Can be filtered by month or property
 */
const getCollectionSummary = async (req, res) => {
  const landlordId = req.user.id;
  const { month, year, propertyId } = req.query;
  
  try {
    const cacheKey = `collections:summary:${landlordId}:${month || 'all'}:${year || moment().year()}:${propertyId || 'all'}`;
    
    // Try to get from cache first
    const cachedData = await getCache(cacheKey);
    if (cachedData) {
      return res.status(200).json(JSON.parse(cachedData));
    }
    
    // Build date filter
    let dateFilter = {};
    if (month && year) {
      const startDate = moment(`${year}-${month}-01`, 'YYYY-MM-DD').startOf('month').toDate();
      const endDate = moment(startDate).endOf('month').toDate();
      
      dateFilter = {
        paymentDate: {
          $gte: startDate,
          $lte: endDate
        }
      };
    } else if (year) {
      const startDate = moment(`${year}-01-01`, 'YYYY-MM-DD').startOf('year').toDate();
      const endDate = moment(startDate).endOf('year').toDate();
      
      dateFilter = {
        paymentDate: {
          $gte: startDate,
          $lte: endDate
        }
      };
    }
    
    // Query properties owned by the landlord
    const propertyQuery = { landlordId };
    if (propertyId) {
      propertyQuery._id = mongoose.Types.ObjectId(propertyId);
    }
    
    const properties = await Property.find(propertyQuery).lean();
    
    if (!properties || properties.length === 0) {
      return res.status(404).json({ message: 'No properties found' });
    }
    
    // Get property IDs
    const propertyIds = properties.map(p => p._id);
    
    // Query all payments for these properties with optional date filter
    const paymentsQuery = {
      propertyId: { $in: propertyIds },
      status: 'Completed',
      ...dateFilter
    };
    
    const payments = await Payment.find(paymentsQuery).lean();
    
    // Prepare summary data
    const summary = {
      totalProperties: properties.length,
      totalCollected: 0,
      collectionByProperty: {},
      collectionByCategory: {
        rent: 0,
        maintenance: 0,
        security: 0,
        electricity: 0,
        water: 0,
        other: 0
      },
      collectionByMonth: {},
      recentPayments: []
    };
    
    // Process payments data
    for (const payment of payments) {
      const amount = payment.amount || 0;
      const propertyId = payment.propertyId.toString();
      const property = properties.find(p => p._id.toString() === propertyId);
      const propertyName = property ? property.name : 'Unknown Property';
      const paymentMonth = moment(payment.paymentDate).format('YYYY-MM');
      const paymentCategory = payment.category?.toLowerCase() || 'other';
      
      // Add to total
      summary.totalCollected += amount;
      
      // Add to property collections
      if (!summary.collectionByProperty[propertyId]) {
        summary.collectionByProperty[propertyId] = {
          propertyId,
          propertyName,
          totalAmount: 0,
          paymentCount: 0
        };
      }
      summary.collectionByProperty[propertyId].totalAmount += amount;
      summary.collectionByProperty[propertyId].paymentCount += 1;
      
      // Add to category collections
      if (paymentCategory === 'rent') {
        summary.collectionByCategory.rent += amount;
      } else if (paymentCategory === 'maintenance') {
        summary.collectionByCategory.maintenance += amount;
      } else if (paymentCategory === 'security') {
        summary.collectionByCategory.security += amount;
      } else if (paymentCategory === 'electricity') {
        summary.collectionByCategory.electricity += amount;
      } else if (paymentCategory === 'water') {
        summary.collectionByCategory.water += amount;
      } else {
        summary.collectionByCategory.other += amount;
      }
      
      // Add to monthly collections
      if (!summary.collectionByMonth[paymentMonth]) {
        summary.collectionByMonth[paymentMonth] = 0;
      }
      summary.collectionByMonth[paymentMonth] += amount;
      
      // Add to recent payments (include only necessary info)
      summary.recentPayments.push({
        paymentId: payment.paymentId,
        tenantId: payment.tenantId,
        propertyId: payment.propertyId,
        propertyName,
        amount,
        category: payment.category,
        paymentDate: payment.paymentDate,
        paymentMethod: payment.paymentMethod
      });
    }
    
    // Sort recent payments by date (newest first) and limit to 10
    summary.recentPayments.sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate));
    summary.recentPayments = summary.recentPayments.slice(0, 10);
    
    // Convert collection by property from object to array
    summary.collectionByProperty = Object.values(summary.collectionByProperty);
    
    // Sort months chronologically
    const sortedMonths = {};
    Object.keys(summary.collectionByMonth)
      .sort((a, b) => moment(a, 'YYYY-MM').diff(moment(b, 'YYYY-MM')))
      .forEach(month => {
        sortedMonths[month] = summary.collectionByMonth[month];
      });
    
    summary.collectionByMonth = sortedMonths;
    
    // Cache the result for 1 hour
    await setCache(cacheKey, JSON.stringify(summary), 3600);
    
    return res.status(200).json(summary);
  } catch (error) {
    console.error('Error in getCollectionSummary:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get detailed collection report for a specific property
 */
const getPropertyCollectionReport = async (req, res) => {
  const landlordId = req.user.id;
  const { propertyId } = req.params;
  const { month, year, detailed } = req.query;
  
  try {
    // Validate property belongs to landlord
    const property = await Property.findOne({ _id: propertyId, landlordId });
    
    if (!property) {
      return res.status(404).json({ message: 'Property not found or unauthorized' });
    }
    
    // Build date filter
    let dateFilter = {};
    let reportPeriod = 'All Time';
    
    if (month && year) {
      const startDate = moment(`${year}-${month}-01`, 'YYYY-MM-DD').startOf('month').toDate();
      const endDate = moment(startDate).endOf('month').toDate();
      
      dateFilter = {
        paymentDate: {
          $gte: startDate,
          $lte: endDate
        }
      };
      reportPeriod = moment(startDate).format('MMMM YYYY');
    } else if (year) {
      const startDate = moment(`${year}-01-01`, 'YYYY-MM-DD').startOf('year').toDate();
      const endDate = moment(startDate).endOf('year').toDate();
      
      dateFilter = {
        paymentDate: {
          $gte: startDate,
          $lte: endDate
        }
      };
      reportPeriod = year;
    }
    
    // Find all payments for this property with optional date filter
    const paymentsQuery = {
      propertyId,
      status: 'Completed',
      ...dateFilter
    };
    
    const payments = await Payment.find(paymentsQuery).lean();
    
    // Get all tenants who made payments
    const tenantIds = [...new Set(payments.map(p => p.tenantId))];
    const tenants = await Tenant.find({ tenantId: { $in: tenantIds } }, 'tenantId name mobile email').lean();
    
    // Create tenant lookup map
    const tenantMap = {};
    tenants.forEach(tenant => {
      tenantMap[tenant.tenantId] = {
        name: tenant.name,
        mobile: tenant.mobile,
        email: tenant.email
      };
    });
    
    // Prepare report data
    const report = {
      propertyId: property._id,
      propertyName: property.name,
      reportPeriod,
      totalCollected: 0,
      paymentCount: payments.length,
      collectionByCategory: {
        rent: 0,
        maintenance: 0,
        security: 0,
        electricity: 0,
        water: 0,
        other: 0
      },
      collectionByTenant: {},
      collectionByRoom: {},
      collectionByMonth: {},
      collectionByPaymentMethod: {},
      allPayments: detailed === 'true' ? [] : undefined
    };
    
    // Process payments data
    for (const payment of payments) {
      const amount = payment.amount || 0;
      const tenantId = payment.tenantId;
      const roomId = payment.roomId || 'unspecified';
      const paymentMonth = moment(payment.paymentDate).format('YYYY-MM');
      const paymentCategory = payment.category?.toLowerCase() || 'other';
      const paymentMethod = payment.paymentMethod || 'other';
      const tenantInfo = tenantMap[tenantId] || { name: 'Unknown Tenant' };
      
      // Add to total
      report.totalCollected += amount;
      
      // Add to category collections
      if (paymentCategory === 'rent') {
        report.collectionByCategory.rent += amount;
      } else if (paymentCategory === 'maintenance') {
        report.collectionByCategory.maintenance += amount;
      } else if (paymentCategory === 'security') {
        report.collectionByCategory.security += amount;
      } else if (paymentCategory === 'electricity') {
        report.collectionByCategory.electricity += amount;
      } else if (paymentCategory === 'water') {
        report.collectionByCategory.water += amount;
      } else {
        report.collectionByCategory.other += amount;
      }
      
      // Add to tenant collections
      if (!report.collectionByTenant[tenantId]) {
        report.collectionByTenant[tenantId] = {
          tenantId,
          tenantName: tenantInfo.name,
          tenantMobile: tenantInfo.mobile,
          tenantEmail: tenantInfo.email,
          totalAmount: 0,
          paymentCount: 0
        };
      }
      report.collectionByTenant[tenantId].totalAmount += amount;
      report.collectionByTenant[tenantId].paymentCount += 1;
      
      // Add to room collections
      if (!report.collectionByRoom[roomId]) {
        report.collectionByRoom[roomId] = {
          roomId,
          totalAmount: 0,
          paymentCount: 0
        };
      }
      report.collectionByRoom[roomId].totalAmount += amount;
      report.collectionByRoom[roomId].paymentCount += 1;
      
      // Add to monthly collections
      if (!report.collectionByMonth[paymentMonth]) {
        report.collectionByMonth[paymentMonth] = 0;
      }
      report.collectionByMonth[paymentMonth] += amount;
      
      // Add to payment method collections
      if (!report.collectionByPaymentMethod[paymentMethod]) {
        report.collectionByPaymentMethod[paymentMethod] = 0;
      }
      report.collectionByPaymentMethod[paymentMethod] += amount;
      
      // Add to all payments if detailed view requested
      if (detailed === 'true') {
        report.allPayments.push({
          paymentId: payment.paymentId,
          tenantId: payment.tenantId,
          tenantName: tenantInfo.name,
          amount,
          category: payment.category,
          description: payment.description,
          paymentDate: payment.paymentDate,
          paymentMethod,
          roomId
        });
      }
    }
    
    // Convert collections from objects to arrays
    report.collectionByTenant = Object.values(report.collectionByTenant)
      .sort((a, b) => b.totalAmount - a.totalAmount);
    
    report.collectionByRoom = Object.values(report.collectionByRoom)
      .sort((a, b) => b.totalAmount - a.totalAmount);
    
    // Sort payments by date if detailed view
    if (detailed === 'true') {
      report.allPayments.sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate));
    }
    
    // Sort months chronologically
    const sortedMonths = {};
    Object.keys(report.collectionByMonth)
      .sort((a, b) => moment(a, 'YYYY-MM').diff(moment(b, 'YYYY-MM')))
      .forEach(month => {
        sortedMonths[month] = report.collectionByMonth[month];
      });
    
    report.collectionByMonth = sortedMonths;
    
    return res.status(200).json(report);
  } catch (error) {
    console.error('Error in getPropertyCollectionReport:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Generate monthly collection forecast based on historical data
 */
const getCollectionForecast = async (req, res) => {
  const landlordId = req.user.id;
  const { propertyId } = req.query;
  
  try {
    // Build query to get properties
    const propertyQuery = { landlordId };
    if (propertyId) {
      propertyQuery._id = mongoose.Types.ObjectId(propertyId);
    }
    
    // Get landlord's properties
    const properties = await Property.find(propertyQuery).lean();
    
    if (!properties || properties.length === 0) {
      return res.status(404).json({ message: 'No properties found' });
    }
    
    const propertyIds = properties.map(p => p._id);
    const propertyMap = {};
    properties.forEach(p => {
      propertyMap[p._id.toString()] = p.name;
    });
    
    // Calculate dates for current month and next three months
    const currentMonth = moment().startOf('month');
    const forecast = {
      currentMonth: {
        month: currentMonth.format('MMMM YYYY'),
        expected: 0,
        byProperty: {}
      },
      nextMonth: {
        month: moment(currentMonth).add(1, 'months').format('MMMM YYYY'),
        expected: 0,
        byProperty: {}
      },
      twoMonthsAhead: {
        month: moment(currentMonth).add(2, 'months').format('MMMM YYYY'),
        expected: 0,
        byProperty: {}
      },
      breakdown: {}
    };
    
    // Initialize forecast structure
    propertyIds.forEach(propId => {
      const propIdStr = propId.toString();
      forecast.currentMonth.byProperty[propIdStr] = { 
        propertyId: propIdStr,
        propertyName: propertyMap[propIdStr],
        expected: 0 
      };
      forecast.nextMonth.byProperty[propIdStr] = { 
        propertyId: propIdStr,
        propertyName: propertyMap[propIdStr],
        expected: 0 
      };
      forecast.twoMonthsAhead.byProperty[propIdStr] = { 
        propertyId: propIdStr,
        propertyName: propertyMap[propIdStr],
        expected: 0 
      };
      forecast.breakdown[propIdStr] = {
        propertyId: propIdStr,
        propertyName: propertyMap[propIdStr],
        rentAmount: 0,
        maintenanceAmount: 0,
        electricityAmount: 0,
        waterAmount: 0,
        otherAmount: 0,
        totalAmount: 0,
        tenantCount: 0
      };
    });
    
    // Get all active tenants for these properties to calculate expected collections
    const tenants = await Tenant.find({
      'accommodations.propertyId': { $in: propertyIds },
      'accommodations.isActive': true
    });
    
    // Process each tenant's rent and other dues
    for (const tenant of tenants) {
      // Process active accommodations
      for (const accommodation of tenant.accommodations) {
        if (!accommodation.isActive) continue;
        
        const propId = accommodation.propertyId.toString();
        if (!propertyIds.some(id => id.toString() === propId)) continue;
        
        // Calculate total monthly dues for this tenant at this property
        const rent = accommodation.rentAmount || 0;
        const maintenance = accommodation.maintenanceFee || 0;
        const electricity = accommodation.electricityFee || 0;
        const water = accommodation.waterFee || 0;
        const other = accommodation.otherCharges || 0;
        
        const totalMonthlyDue = rent + maintenance + electricity + water + other;
        
        // Add to forecast
        forecast.currentMonth.expected += totalMonthlyDue;
        forecast.currentMonth.byProperty[propId].expected += totalMonthlyDue;
        
        forecast.nextMonth.expected += totalMonthlyDue;
        forecast.nextMonth.byProperty[propId].expected += totalMonthlyDue;
        
        forecast.twoMonthsAhead.expected += totalMonthlyDue;
        forecast.twoMonthsAhead.byProperty[propId].expected += totalMonthlyDue;
        
        // Add to breakdown
        forecast.breakdown[propId].rentAmount += rent;
        forecast.breakdown[propId].maintenanceAmount += maintenance;
        forecast.breakdown[propId].electricityAmount += electricity;
        forecast.breakdown[propId].waterAmount += water;
        forecast.breakdown[propId].otherAmount += other;
        forecast.breakdown[propId].totalAmount += totalMonthlyDue;
        forecast.breakdown[propId].tenantCount += 1;
      }
    }
    
    // Convert byProperty objects to arrays
    forecast.currentMonth.byProperty = Object.values(forecast.currentMonth.byProperty);
    forecast.nextMonth.byProperty = Object.values(forecast.nextMonth.byProperty);
    forecast.twoMonthsAhead.byProperty = Object.values(forecast.twoMonthsAhead.byProperty);
    forecast.breakdown = Object.values(forecast.breakdown);
    
    // Get past collection efficiency (payments received vs expected)
    // For the past 3 months
    const threeMonthsAgo = moment().subtract(3, 'months').startOf('month').toDate();
    const pastPayments = await Payment.find({
      propertyId: { $in: propertyIds },
      status: 'Completed',
      paymentDate: { $gte: threeMonthsAgo }
    }).lean();
    
    // Calculate collection efficiency
    const pastMonths = [];
    for (let i = 3; i >= 1; i--) {
      const month = moment().subtract(i, 'months');
      const monthStr = month.format('YYYY-MM');
      const startDate = month.startOf('month').toDate();
      const endDate = month.endOf('month').toDate();
      
      const monthlyPayments = pastPayments.filter(
        p => p.paymentDate >= startDate && p.paymentDate <= endDate
      );
      
      const collected = monthlyPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      
      pastMonths.push({
        month: month.format('MMMM YYYY'),
        collected,
        // Assume similar expected amount as current month for simplicity
        expected: forecast.currentMonth.expected,
        efficiency: forecast.currentMonth.expected > 0 
          ? Math.round((collected / forecast.currentMonth.expected) * 100)
          : 0
      });
    }
    
    forecast.pastCollectionEfficiency = pastMonths;
    
    // Apply historical collection efficiency to forecast
    const avgEfficiency = pastMonths.reduce((sum, m) => sum + m.efficiency, 0) / pastMonths.length;
    forecast.projectedEfficiency = Math.round(avgEfficiency) || 100; // Default to 100% if no historical data
    
    forecast.currentMonth.projectedCollection = Math.round(forecast.currentMonth.expected * (forecast.projectedEfficiency / 100));
    forecast.nextMonth.projectedCollection = Math.round(forecast.nextMonth.expected * (forecast.projectedEfficiency / 100));
    forecast.twoMonthsAhead.projectedCollection = Math.round(forecast.twoMonthsAhead.expected * (forecast.projectedEfficiency / 100));
    
    return res.status(200).json(forecast);
  } catch (error) {
    console.error('Error in getCollectionForecast:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  getCollectionSummary,
  getPropertyCollectionReport,
  getCollectionForecast
};
