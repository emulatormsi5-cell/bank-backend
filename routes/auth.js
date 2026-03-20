const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const OTP = require('../models/OTP');
const sendOTPEmail = require('../utils/email');

// 6-digit OTP generate karne ka function
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// ====================== API 1: SEND OTP ======================
router.post('/send-otp', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Pehle check karo user already exist to nahi hai
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        // OTP generate karo
        const otp = generateOTP();

        // OTP ko database mein save karo (agar pehle se hai to update karo)
        await OTP.findOneAndUpdate(
            { email },
            { otp, createdAt: new Date() },
            { upsert: true, new: true }
        );

        // Email bhejo
        await sendOTPEmail(email, otp);

        res.json({ message: 'OTP sent successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// ====================== API 2: VERIFY OTP & REGISTER ======================
router.post('/verify-otp', async (req, res) => {
    try {
        const { email, otp, password } = req.body;

        // OTP check karo
        const otpRecord = await OTP.findOne({ email, otp });
        if (!otpRecord) {
            return res.status(400).json({ error: 'Invalid or expired OTP' });
        }

        // Password hash karo
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // User create karo
        const user = new User({ email, password: hashedPassword });
        await user.save();

        // OTP record delete karo (ab use nahi hoga)
        await OTP.deleteOne({ email });

        // JWT token generate karo (login ke liye)
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

        res.json({ token, user: { email: user.email } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// ====================== API 3: LOGIN ======================
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // User find karo
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        // Password compare karo
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        // Token generate karo
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

        res.json({ token, user: { email: user.email } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// ====================== API 4: GET CURRENT USER (optional) ======================
router.get('/me', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1]; // "Bearer <token>"
        if (!token) return res.status(401).json({ error: 'No token' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId).select('-password');
        if (!user) return res.status(404).json({ error: 'User not found' });

        res.json({ user });
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
});

module.exports = router;