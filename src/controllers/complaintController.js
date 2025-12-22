const mongoose = require('mongoose');
const Tenant = require('../models/Tenant');
const Property = require('../models/Property');
const { setCache, getCache } = require('../utils/redis');

/**
 * Schema for Complaint model in Tenant schema:
 * {
 *   complaintId: { type: String, default: () => `COMP-${Math.random().toString(36).substr(2, 9)}` },
 *   propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
 *   landlordId: { type: mongoose.Schema.Types.ObjectId, ref: 'Landlord', required: true },
 *   roomId: { type: String },
 *   bedId: { type: String },
 *   subject: { type: String, required: true },
 *   description: { type: String, required: true },
 *   status: { type: String, enum: ['Pending', 'Accepted', 'In Progress', 'Resolved', 'Rejected'], default: 'Pending' },
 *   priority: { type: String, enum: ['Low', 'Medium', 'High', 'Critical'], default: 'Medium' },
 *   createdAt: { type: Date, default: Date.now },
 *   updatedAt: { type: Date, default: Date.now },
 *   landlordResponse: { type: String },
 *   resolvedAt: { type: Date }
 * }
 */

/**
 * Add a new complaint from tenant
 */
const addComplaint = async (req, res) => {
  const { tenantId, propertyId, roomId, bedId, subject, description, priority } = req.body;

  if (!tenantId || !propertyId || !subject || !description) {
    return res.status(400).json({ 
      message: 'Tenant ID, Property ID, Subject, and Description are required' 
    });
  }

  try {
    // Check if tenant exists and is active at the property
    const tenant = await Tenant.findOne({
      tenantId,
      'accommodations.propertyId': propertyId,
      'accommodations.isActive': true
    });

    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found or not active at this property' });
    }

    // Get property details
    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }

    // Create complaint object
    const complaintId = `COMP-${Math.random().toString(36).substr(2, 9)}`;
    const newComplaint = {
      complaintId,
      propertyId,
      landlordId: property.landlordId,
      roomId: roomId || tenant.accommodations.find(acc => acc.propertyId.toString() === propertyId.toString())?.roomId,
      bedId: bedId || tenant.accommodations.find(acc => acc.propertyId.toString() === propertyId.toString())?.bedId,
      subject,
      description,
      status: 'Pending',
      priority: priority || 'Medium',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Initialize complaints array if it doesn't exist
    if (!tenant.complaints) {
      tenant.complaints = [];
    }

    // Add complaint to tenant
    tenant.complaints.push(newComplaint);
    await tenant.save();

    return res.status(201).json({
      message: 'Complaint added successfully',
      complaint: newComplaint
    });
  } catch (error) {
    console.error('Error in addComplaint:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get all complaints for a landlord
 */
const getAllComplaints = async (req, res) => {
  const { propertyId, status, priority } = req.query;
  const landlordId = req.user.id;

  try {
    // Find all tenants with complaints for this landlord
    const tenants = await Tenant.find({
      'complaints.landlordId': landlordId
    });

    if (!tenants || tenants.length === 0) {
      return res.status(200).json({
        message: 'No complaints found',
        complaints: []
      });
    }

    // Get all properties owned by this landlord for reference
    const properties = await Property.find({ landlordId });
    const propertyMap = {};
    properties.forEach(property => {
      propertyMap[property._id.toString()] = property.name;
    });

    // Extract and process all complaints
    const allComplaints = [];
    
    for (const tenant of tenants) {
      // Filter complaints for this landlord
      let complaints = tenant.complaints?.filter(complaint => 
        complaint.landlordId.toString() === landlordId.toString() &&
        (propertyId ? complaint.propertyId.toString() === propertyId : true) &&
        (status ? complaint.status === status : true) &&
        (priority ? complaint.priority === priority : true)
      ) || [];

      // Add tenant details to each complaint
      complaints.forEach(complaint => {
        const propertyName = propertyMap[complaint.propertyId.toString()] || 'Unknown Property';
        
        allComplaints.push({
          ...complaint.toObject(),
          tenantId: tenant.tenantId,
          tenantName: tenant.name,
          tenantMobile: tenant.mobile,
          tenantEmail: tenant.email,
          propertyName
        });
      });
    }

    // Sort complaints by created date (newest first)
    allComplaints.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Group complaints by status
    const complaintsByStatus = {
      Pending: allComplaints.filter(c => c.status === 'Pending'),
      Accepted: allComplaints.filter(c => c.status === 'Accepted'),
      InProgress: allComplaints.filter(c => c.status === 'In Progress'),
      Resolved: allComplaints.filter(c => c.status === 'Resolved'),
      Rejected: allComplaints.filter(c => c.status === 'Rejected')
    };

    // Group complaints by property
    const complaintsByProperty = {};
    allComplaints.forEach(complaint => {
      const propertyId = complaint.propertyId.toString();
      const propertyName = complaint.propertyName;
      
      if (!complaintsByProperty[propertyId]) {
        complaintsByProperty[propertyId] = {
          propertyId,
          propertyName,
          complaints: []
        };
      }
      
      complaintsByProperty[propertyId].complaints.push(complaint);
    });

    return res.status(200).json({
      totalComplaints: allComplaints.length,
      complaintsByStatus,
      complaintsByProperty: Object.values(complaintsByProperty),
      allComplaints
    });
  } catch (error) {
    console.error('Error in getAllComplaints:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get tenant's complaints
 */
const getTenantComplaints = async (req, res) => {
  const { tenantId } = req.params;

  try {
    const tenant = await Tenant.findOne({ tenantId });
    
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    // Ensure complaints exists and is an array
    const complaints = tenant.complaints || [];
    
    // Sort complaints by created date (newest first)
    complaints.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    return res.status(200).json(complaints);
  } catch (error) {
    console.error('Error in getTenantComplaints:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Update complaint status by landlord
 */
const updateComplaintStatus = async (req, res) => {
  const { tenantId, complaintId } = req.params;
  const { status, landlordResponse } = req.body;
  const landlordId = req.user.id;
  
  try {
    const tenant = await Tenant.findOne({ tenantId });
    
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    // Find the complaint in the tenant's complaints array
    const complaintIndex = tenant.complaints?.findIndex(
      c => c.complaintId === complaintId && c.landlordId.toString() === landlordId.toString()
    );
    
    if (complaintIndex === -1 || complaintIndex === undefined) {
      return res.status(404).json({ message: 'Complaint not found' });
    }
    
    // Update the complaint
    tenant.complaints[complaintIndex].status = status;
    tenant.complaints[complaintIndex].updatedAt = new Date();
    
    if (landlordResponse) {
      tenant.complaints[complaintIndex].landlordResponse = landlordResponse;
    }
    
    if (status === 'Resolved') {
      tenant.complaints[complaintIndex].resolvedAt = new Date();
    }
    
    await tenant.save();
    
    return res.status(200).json({
      message: 'Complaint status updated successfully',
      complaint: tenant.complaints[complaintIndex]
    });
  } catch (error) {
    console.error('Error in updateComplaintStatus:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  addComplaint,
  getAllComplaints,
  getTenantComplaints,
  updateComplaintStatus
};
