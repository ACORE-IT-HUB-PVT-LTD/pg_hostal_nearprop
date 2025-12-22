const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  paymentId: { type: String, default: () => `PAY-${Math.random().toString(36).substr(2, 9)}` },
  tenantId: { type: String, required: true },
  landlordId: { type: mongoose.Schema.Types.ObjectId, ref: 'Landlord', required: true },
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
  propertyName: { type: String },
  roomId: { type: String },
  bedId: { type: String },
  billIds: [{ type: mongoose.Schema.Types.ObjectId }], // Reference to bills being paid
  amount: { type: Number, required: true },
  paymentDate: { type: Date, default: Date.now },
  method: { type: String, enum: ['Cash', 'Bank Transfer', 'UPI', 'Cheque', 'Card', 'Other'], required: true },
  status: { type: String, enum: ['Pending', 'Completed', 'Failed', 'Refunded'], default: 'Completed' },
  transactionId: { type: String },
  receiptNumber: { type: String },
  receiptUrl: { type: String },
  note: { type: String },
  category: { type: String, enum: ['Rent', 'Electricity', 'Water', 'Maintenance', 'Security Deposit', 'Internet', 'Food', 'Cleaning', 'Gas', 'Other'], required: true },
  month: { type: String },
  year: { type: String },
  paymentBreakdown: [{
    category: { type: String },
    amount: { type: Number }
  }],
  taxAmount: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  remarks: { type: String },
  collectedBy: { type: String }
}, { timestamps: true });

// Add indexes for efficient queries
paymentSchema.index({ landlordId: 1 });
paymentSchema.index({ tenantId: 1 });
paymentSchema.index({ propertyId: 1 });
paymentSchema.index({ paymentDate: 1 });
paymentSchema.index({ category: 1 });
paymentSchema.index({ status: 1 });

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = Payment;
