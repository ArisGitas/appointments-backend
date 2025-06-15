// src/services/emailService.js
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config(); // Φορτώνει τις μεταβλητές περιβάλλοντος από το .env

// Δημιουργία μεταφορέα (transporter) Nodemailer
// ΜΠΟΡΕΙΣ ΝΑ ΕΠΙΛΕΞΕΙΣ ΕΝΑΝ ΑΠΟ ΤΟΥΣ ΠΑΡΑΚΑΤΩ ΤΡΟΠΟΥΣ:

// --- ΕΠΙΛΟΓΗ 1: Χρήση Gmail (για δοκιμές/μικρά projects - όχι για παραγωγή) ---
// Απαιτεί να έχεις ενεργοποιήσει "Less secure app access" στο Gmail σου
// ή να χρησιμοποιείς App Passwords αν έχεις 2FA.
const createGmailTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER, // Το email σου στο Gmail
      pass: process.env.GMAIL_APP_PASSWORD, // Ο κωδικός εφαρμογής Gmail ή ο κανονικός κωδικός σου (αν δεν έχεις 2FA)
    },
  });
};

// --- ΕΠΙΛΟΓΗ 2: Χρήση Resend.com (προτεινόμενο για δωρεάν tier/παραγωγή) ---
// Απαιτεί να δημιουργήσεις λογαριασμό στο Resend.com και να πάρεις ένα API Key.
// Επίσης, πρέπει να επαληθεύσεις το domain σου στο Resend.
const createResendTransporter = () => {
  return nodemailer.createTransport({
    host: 'smtp.resend.com',
    port: 465, // ή 587
    secure: true, // true for 465, false for other ports
    auth: {
      user: 'resend', // Ο χρήστης είναι πάντα 'resend'
      pass: process.env.RESEND_API_KEY, // Το API Key σου από το Resend.com
    },
  });
};

// --- ΕΠΙΛΟΓΗ 3: Γενικό SMTP (για άλλους παρόχους όπως Mailgun, SendGrid κ.λπ.) ---
// Θα χρειαστείς τα στοιχεία SMTP του παρόχου σου.
const createSmtpTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10),
    secure: process.env.SMTP_SECURE === 'true', // true αν ο port είναι 465, false αν είναι 587/25
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};


// Επιλέξτε ποιον transporter θα χρησιμοποιήσετε.
// Για παράδειγμα, μπορείτε να έχετε ένα ENVIRONMENT_MODE και να επιλέγετε.
// Ας χρησιμοποιήσουμε ένα απλό setup για τώρα, π.χ., Resend.
const transporter = createResendTransporter(); // Ή createGmailTransporter() Ή createSmtpTransporter()

// Έλεγχος σύνδεσης (προαιρετικό, αλλά καλό για debugging)
transporter.verify(function (error, success) {
  if (error) {
    console.error("❌ Nodemailer transporter verification failed:", error);
  } else {
    console.log("✅ Nodemailer transporter is ready to send emails!");
  }
});

// Συνάρτηση για αποστολή email
export const sendEmail = async (to, subject, text, html) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'no-reply@yourbusiness.com', // Το email από το οποίο θα στέλνονται τα email
      to,
      subject,
      text,
      html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent: %s', info.messageId);
    return info;
  } catch (error) {
    console.error('❌ Error sending email:', error);
    throw new Error(`Αποτυχία αποστολής email: ${error.message}`);
  }
};
