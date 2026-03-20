const sendOTPEmail = require('./utils/email');

sendOTPEmail('tumhara-email@gmail.com', '123456')
  .then(() => console.log('✅ Email sent'))
  .catch(err => console.log('❌ Email error:', err));