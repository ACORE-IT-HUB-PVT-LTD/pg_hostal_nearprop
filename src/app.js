const express = require('express');
const landlordRoutes = require('./routes/landlordRoutes');
const propertyRoutes = require('./routes/propertyRoutes');
const tenantRoutes = require('./routes/tenantRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const reelRoutes = require('./routes/reelRoutes');
const ratingRoutes = require('./routes/ratingRoutes');
const publicRatingRoutes = require('./routes/publicRatingRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const subscriptionPlanRoutes = require('./routes/subscriptionPlanRoutes');
const { attachRatingSummary } = require('./middleware/ratingEnhancement');

const app = express();

// Debug middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  console.log('Headers:', req.headers);
  next();
});

app.use(express.json());

// Apply rating enhancement middleware to all responses
app.use(attachRatingSummary);

// Mount routes with base paths - all under /api/landlord
app.use('/api/landlord/property', propertyRoutes);  // Singular route (/api/landlord/property/:propertyId/rooms)
app.use('/api/landlord/properties', propertyRoutes);  // Also support plural route (/api/landlord/properties/:propertyId/rooms)
app.use('/api/landlord/tenant', tenantRoutes);
app.use('/api/landlord/analytics', analyticsRoutes);
app.use('/api/landlord', landlordRoutes);  // General landlord routes should be last to avoid conflicts

// Reels API routes
app.use('/api/reels', reelRoutes);

// Public property routes including nearby search
app.use('/api/properties', propertyRoutes);

// Rating, Review, and Comment routes
app.use('/api', ratingRoutes);
app.use('/api/public/ratings', publicRatingRoutes);

// Subscription routes
app.use('/api/subscription', subscriptionRoutes);

// Subscription Plan routes
app.use('/api/subscription-plans', subscriptionPlanRoutes);

app.get('/test', (req, res) => res.send('Test OK'));

// Health check endpoint for Docker and monitoring
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// Also provide health check at API endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    service: 'PG Rental API',
    version: process.env.npm_package_version || '1.0.0'
  });
});

module.exports = app;