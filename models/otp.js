const mongoose = require('mongoose');

const OTPSchema = new mongoose.Schema({
    email: { type: String, required: true },
    otp: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, expires: 600 }  // 600 seconds = 10 min
});

module.exports = mongoose.model('OTP', OTPSchema);