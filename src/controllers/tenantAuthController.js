const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Tenant = require('../models/Tenant');
const { redisClient } = require('../config/database');
require('dotenv').config();

/**
 * Register a new tenant
 */
const registerTenant = async (req, res) => {
  const { 
    name, email, aadhaar, mobile, permanentAddress, 
    work, dob, maritalStatus, fatherName, fatherMobile, 
    motherName, motherMobile, photo 
  } = req.body;
  
  try {
    // Basic validation
    if (!name || !aadhaar || !mobile) {
      return res.status(400).json({ message: 'Name, Aadhaar, and Mobile are required fields' });
    }

    // Check if tenant with same aadhaar already exists
    let tenant = await Tenant.findOne({ aadhaar });
    
    if (tenant) {
      return res.status(400).json({ message: 'Tenant with this Aadhaar already exists' });
    }

    // Check if tenant with same mobile already exists
    tenant = await Tenant.findOne({ mobile });
    
    if (tenant) {
      return res.status(400).json({ message: 'Tenant with this mobile number already exists' });
    }

    // Create tenant ID - will be used for login
    const tenantId = `T-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create new tenant
    tenant = new Tenant({
      tenantId,
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
      accommodations: [],
      bookingRequests: [],
      bills: [],
      complaints: []
    });
    
    await tenant.save();
    
    // Generate token
    const token = jwt.sign(
      { id: tenantId, role: 'tenant', email, mobile }, 
      process.env.JWT_SECRET, 
      { expiresIn: '30d' }
    );
    
    // Store in Redis
    await redisClient.setEx(`tenant:${tenantId}`, 3600, JSON.stringify({ token }));
    
    return res.status(201).json({
      success: true,
      message: 'Tenant registered successfully',
      token,
      tenant: {
        tenantId: tenant.tenantId,
        name: tenant.name,
        mobile: tenant.mobile,
        email: tenant.email
      }
    });
  } catch (error) {
    console.error('Error in registerTenant:', error);
    return res.status(500).json({
      message: 'Error registering tenant',
      error: error.message
    });
  }
};

/**
 * Login tenant
 */
const loginTenant = async (req, res) => {
  const { mobile, aadhaar } = req.body;
  
  try {
    // Validate required fields
    if (!mobile || !aadhaar) {
      return res.status(400).json({ message: 'Mobile and Aadhaar are required' });
    }
    
    // Find tenant
    const tenant = await Tenant.findOne({
      mobile,
      aadhaar
    });
    
    if (!tenant) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    // Generate token
    const token = jwt.sign(
      { 
        id: tenant.tenantId, 
        role: 'tenant', 
        email: tenant.email, 
        mobile: tenant.mobile
      }, 
      process.env.JWT_SECRET, 
      { expiresIn: '30d' }
    );
    
    // Store in Redis
    await redisClient.setEx(`tenant:${tenant.tenantId}`, 3600 * 24, JSON.stringify({ token }));
    
    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      tenant: {
        tenantId: tenant.tenantId,
        name: tenant.name,
        email: tenant.email
      }
    });
  } catch (error) {
    console.error('Error in loginTenant:', error);
    return res.status(500).json({
      message: 'Error during login',
      error: error.message
    });
  }
};

/**
 * Update tenant profile (for tenants to update their own profile)
 */
const updateTenantProfile = async (req, res) => {
  try {
    const tenantId = req.user.id;
    const {
      name,
      email,
      mobile,
      permanentAddress,
      work,
      dob,
      maritalStatus,
      fatherName,
      fatherMobile,
      motherName,
      motherMobile,
      emergencyContact
    } = req.body;
    
    // Find tenant
    const tenant = await Tenant.findOne({ tenantId });
    
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    // Update fields
    if (name) tenant.name = name;
    if (email) tenant.email = email;
    if (mobile) tenant.mobile = mobile;
    if (permanentAddress) tenant.permanentAddress = permanentAddress;
    if (work) tenant.work = work;
    if (dob) tenant.dob = new Date(dob);
    if (maritalStatus) tenant.maritalStatus = maritalStatus;
    if (fatherName) tenant.fatherName = fatherName;
    if (fatherMobile) tenant.fatherMobile = fatherMobile;
    if (motherName) tenant.motherName = motherName;
    if (motherMobile) tenant.motherMobile = motherMobile;
    
    // Update emergency contact if provided
    if (emergencyContact) {
      tenant.emergencyContact = {
        ...tenant.emergencyContact,
        ...emergencyContact
      };
    }
    
    // Save changes
    tenant.updatedAt = new Date();
    await tenant.save();
    
    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      tenant: {
        tenantId: tenant.tenantId,
        name: tenant.name,
        email: tenant.email,
        mobile: tenant.mobile,
        permanentAddress: tenant.permanentAddress,
        work: tenant.work,
        dob: tenant.dob,
        maritalStatus: tenant.maritalStatus,
        emergencyContact: tenant.emergencyContact
      }
    });
  } catch (error) {
    console.error('Error in updateTenantProfile:', error);
    return res.status(500).json({
      message: 'Error updating tenant profile',
      error: error.message
    });
  }
};

module.exports = {
  registerTenant,
  loginTenant,
  updateTenantProfile
};
