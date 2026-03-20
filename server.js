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
  balance: { type: Number, default: 12480.00 }, // Default balance for new users
  cardNumber: { type: String, default: '4580' },
  expiryDate: { type: String, default: '09/28' },
  accountType: { type: String, default: 'Premium Savings' },
  createdAt: { type: Date, default: Date.now }
});

// OTP Schema
const OTPSchema = new mongoose.Schema({
  email: { type: String, required: true },
  otp: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 600 } // 10 minutes
});

// Transaction Schema
const TransactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  amount: { type: Number, required: true },
  category: { type: String, default: 'General' },
  status: { type: String, enum: ['completed', 'pending'], default: 'completed' },
  date: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const OTP = mongoose.model('OTP', OTPSchema);
const Transaction = mongoose.model('Transaction', TransactionSchema);

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

// ==================== Auth Routes ====================

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

    // Create user with default balance
    const user = new User({ 
      email, 
      password: hashedPassword,
      balance: 12480.00,
      cardNumber: '4580',
      expiryDate: '09/28',
      accountType: 'Premium Savings'
    });
    await user.save();
    console.log('✅ User registered:', email);

    // Create sample transactions for new user
    const sampleTransactions = [
      { userId: user._id, name: 'Salary Deposit', amount: 3200.00, category: 'Income', status: 'completed' },
      { userId: user._id, name: 'Whole Foods', amount: -82.40, category: 'Groceries', status: 'completed' },
      { userId: user._id, name: 'Starbucks', amount: -5.75, category: 'Food', status: 'completed' },
      { userId: user._id, name: 'Amazon', amount: -245.99, category: 'Shopping', status: 'pending' }
    ];
    await Transaction.insertMany(sampleTransactions);

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

// ==================== User Dashboard Routes ====================

// Get user profile with balance
app.get('/api/user/profile', async (req, res) => {
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

    // Return full profile
    res.json({
      email: user.email,
      balance: user.balance,
      cardNumber: user.cardNumber,
      expiryDate: user.expiryDate,
      accountType: user.accountType,
      createdAt: user.createdAt
    });
  } catch (error) {
    console.error('❌ Profile error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Get transaction history
app.get('/api/user/transactions', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user's transactions sorted by date (most recent first)
    const transactions = await Transaction.find({ userId: decoded.userId })
      .sort({ date: -1 })
      .limit(50); // Limit to last 50 transactions

    // Format transactions for frontend
    const formattedTransactions = transactions.map(t => ({
      id: t._id,
      name: t.name,
      amount: t.amount,
      category: t.category,
      status: t.status,
      date: t.date.toISOString().split('T')[0] // YYYY-MM-DD format
    }));

    res.json(formattedTransactions);
  } catch (error) {
    console.error('❌ Transactions error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Transfer money
app.post('/api/user/transfer', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { toAccount, amount, description } = req.body;

    // Validation
    if (!toAccount || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid transfer details' });
    }

    // Find sender
    const sender = await User.findById(decoded.userId);
    if (!sender) {
      return res.status(404).json({ error: 'Sender not found' });
    }

    // Check sufficient balance
    if (sender.balance < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Find receiver (by email or phone - simplified)
    const receiver = await User.findOne({ email: toAccount });
    if (!receiver) {
      return res.status(404).json({ error: 'Receiver account not found' });
    }

    // Perform transfer (in a real app, use transaction session)
    sender.balance -= parseFloat(amount);
    receiver.balance += parseFloat(amount);

    await sender.save();
    await receiver.save();

    // Create transaction records for both parties
    const senderTransaction = new Transaction({
      userId: sender._id,
      name: `Transfer to ${receiver.email}`,
      amount: -parseFloat(amount),
      category: 'Transfer',
      status: 'completed',
      date: new Date()
    });

    const receiverTransaction = new Transaction({
      userId: receiver._id,
      name: `Transfer from ${sender.email}`,
      amount: parseFloat(amount),
      category: 'Transfer',
      status: 'completed',
      date: new Date()
    });

    await senderTransaction.save();
    await receiverTransaction.save();

    res.json({ 
      success: true, 
      message: 'Transfer successful',
      transactionId: senderTransaction._id,
      newBalance: sender.balance
    });

  } catch (error) {
    console.error('❌ Transfer error:', error);
    res.status(500).json({ error: 'Transfer failed: ' + error.message });
  }
});

// Add money to account (for testing)
app.post('/api/user/add-money', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const user = await User.findById(decoded.userId);
    user.balance += parseFloat(amount);
    await user.save();

    // Create transaction record
    const transaction = new Transaction({
      userId: user._id,
      name: 'Added Money',
      amount: parseFloat(amount),
      category: 'Deposit',
      status: 'completed',
      date: new Date()
    });
    await transaction.save();

    res.json({ 
      success: true, 
      newBalance: user.balance,
      message: 'Money added successfully'
    });

  } catch (error) {
    console.error('❌ Add money error:', error);
    res.status(500).json({ error: 'Failed to add money' });
  }
});

// Get account summary
app.get('/api/user/summary', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get total spent this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthlySpent = await Transaction.aggregate([
      { 
        $match: { 
          userId: decoded.userId,
          amount: { $lt: 0 },
          date: { $gte: startOfMonth }
        }
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const totalSpent = monthlySpent.length > 0 ? Math.abs(monthlySpent[0].total) : 0;

    // Get pending transactions count
    const pendingCount = await Transaction.countDocuments({
      userId: decoded.userId,
      status: 'pending'
    });

    res.json({
      monthlySpent: totalSpent,
      pendingTransactions: pendingCount,
      accountAge: 'Active' // You can calculate this from user.createdAt
    });

  } catch (error) {
    console.error('❌ Summary error:', error);
    res.status(500).json({ error: 'Failed to get summary' });
  }
});

// ==================== Start Server ====================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📝 Test: http://localhost:${PORT}/`);
  console.log(`🔌 API Base: http://localhost:${PORT}/api/auth`);
  console.log(`📊 Dashboard API: http://localhost:${PORT}/api/user/`);
});

// ==================== Export for Vercel ====================
module.exports = app;