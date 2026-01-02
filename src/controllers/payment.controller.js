const Razorpay = require("razorpay");

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});
exports.capturePayment = async (req, res) => {
    const { razorpay_payment_id, amount } = req.body;

    if (!razorpay_payment_id || !amount) {
        return res.status(400).json({
            error: "razorpay_payment_id and amount are required",
        });
    }

    try {
        const payment = await razorpay.payments.fetch(
            razorpay_payment_id
        );
        if (payment.status !== "authorized") {
            return res.status(400).json({
                error: `Payment cannot be captured. Current status: ${payment.status}`,
            });
        }

        const capture = await razorpay.payments.capture(
            razorpay_payment_id,
            Math.round(Number(amount) * 100)
        );

        res.status(200).json({
            message: "Payment captured successfully",
            capture,
        });
    } catch (error) {
        console.error("Razorpay Capture Error:", error);
        res.status(500).json({
            error: "Failed to capture payment",
            details: error.error || error.message,
        });
    }
};
