const nodemailer = require('nodemailer');

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
            <div style="font-family: Arial, sans-serif; padding: 20px;">
                <h2>Welcome to Bank App!</h2>
                <p>Your OTP for registration is:</p>
                <h1 style="background: #f0f0f0; padding: 10px; text-align: center; letter-spacing: 5px;">${otp}</h1>
                <p>This OTP is valid for 10 minutes.</p>
                <p>If you didn't request this, please ignore.</p>
            </div>
        `
    };

    await transporter.sendMail(mailOptions);
};

module.exports = sendOTPEmail;