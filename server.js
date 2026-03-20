// DNS fix for Windows/Node.js v22+
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

// Initialize Express
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Debug middleware - log all requests
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.url}`);
  next();
});

// ==================== MongoDB Connection ====================
const MONGODB_URI = process.env.MONGO_URI || 'mongodb+srv://emulatormsi5_db_user:nIrEpJeQAMtvzbpM@cluster0.8553qvs.mongodb.net/bankapp?retryWrites=true&w=majority';

console.log('🔄 Connecting to MongoDB...');

mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 10000,
  family: 4 // Force IPv4
})
.then(() => console.log('✅ MongoDB connected successfully'))
.catch(err => {
  console.error('❌ MongoDB connection error:');
  console.error('Message:', err.message);
});

// ==================== MongoDB Models ====================
// User Schema
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

// OTP Schema
const OTPSchema = new mongoose.Schema({
  email: { type: String, required: true },
  otp: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 600 } // 10 minutes
});

const User = mongoose.model('User', UserSchema);
const OTP = mongoose.model('OTP', OTPSchema);

// ==================== Email Setup ====================
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const sendOTPEmail = async (email, otp) => {
  const mailOptions = {
    from: '"Bank App" <noreply@bankapp.com>',
    to: email,
    subject: 'Email Verification OTP',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 500px;">
        <h2 style="color: #0b2b44;">Welcome to Bank App!</h2>
        <p>Your OTP for registration is:</p>
        <h1 style="background: #f0f0f0; padding: 15px; text-align: center; font-size: 32px; letter-spacing: 5px; border-radius: 10px;">${otp}</h1>
        <p>This OTP is valid for <strong>10 minutes</strong>.</p>
        <p style="color: #666;">If you didn't request this, please ignore this email.</p>
      </div>
    `
  };
  await transporter.sendMail(mailOptions);
};

// ==================== Helper Functions ====================
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// ==================== API Routes ====================

// Test route
app.get('/', (req, res) => {
  res.json({ message: 'Bank API is running', status: 'ok' });
});

// Send OTP
app.post('/api/auth/send-otp', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('📧 Send OTP request for:', email);

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Generate OTP
    const otp = generateOTP();
    console.log('🔑 Generated OTP:', otp);

    // Save OTP to database
    await OTP.findOneAndUpdate(
      { email },
      { otp, createdAt: new Date() },
      { upsert: true }
    );

    // Send email
    await sendOTPEmail(email, otp);
    console.log('✅ OTP sent to email');

    res.json({ message: 'OTP sent successfully' });
  } catch (error) {
    console.error('❌ Send OTP error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Verify OTP and Register
app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { email, otp, password } = req.body;
    console.log('🔐 Verify OTP for:', email);

    // Check OTP
    const otpRecord = await OTP.findOne({ email, otp });
    if (!otpRecord) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = new User({ email, password: hashedPassword });
    await user.save();
    console.log('✅ User registered:', email);

    // Delete OTP record
    await OTP.deleteOne({ email });

    // Generate JWT
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, user: { email: user.email } });
  } catch (error) {
    console.error('❌ Verify OTP error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('🔑 Login attempt for:', email);

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('✅ Login successful:', email);
    res.json({ token, user: { email: user.email } });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get current user
app.get('/api/auth/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('❌ Me endpoint error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
});

// ==================== Start Server ====================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📝 Test: http://localhost:${PORT}/`);
  console.log(`🔌 API Base: http://localhost:${PORT}/api/auth`);
});

// ==================== Export for Vercel ====================
module.exports = app;