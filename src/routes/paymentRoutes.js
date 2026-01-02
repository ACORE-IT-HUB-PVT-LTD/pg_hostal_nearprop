const express = require("express");
const router = express.Router();

// controller import
const {
    capturePayment,
} = require("../controllers/payment.controller");

// ===============================
// CAPTURE PAYMENT ROUTE
// ===============================
router.post("/capture-payment", capturePayment);

module.exports = router;
