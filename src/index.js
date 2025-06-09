import express from 'express';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import cors from 'cors';

// Import all your route files
import businessRoutes from './routes/businessRoutes.js';
import employeeRoutes from './routes/employees.js'; // Υπάλληλοι
import employeeScheduleRoutes from './routes/employeeSchedule.js'; // Ωράρια υπαλλήλων
import packageRoutes from './routes/packageRoutes.js'; // Διαχείριση πακέτων
import appointmentsRoutes from './routes/appointments.js'; // Ραντεβού

dotenv.config();

const app = express();
const port = process.env.PORT || 3333;

app.use(cors()); // Enable CORS for all origins
app.use(express.json()); // Middleware to parse JSON request bodies

// Δημιουργία pool σύνδεσης με τη βάση δεδομένων
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: process.env.MYSQL_PORT,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test endpoint για έλεγχο σύνδεσης με τη βάση
app.get('/test-db', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT NOW() AS now');
    res.json({ message: 'DB Connected!', serverTime: rows[0].now });
  } catch (error) {
    console.error('❌ DB Error:', error);
    res.status(500).json({ message: 'DB connection failed', error: error.message });
  }
});

// Routes με ξεχωριστά base paths
app.use('/api/business', businessRoutes(pool));          // Επιχειρήσεις
app.use('/api/employees', employeeRoutes(pool));          // Υπάλληλοι
app.use('/api/employee-schedule', employeeScheduleRoutes(pool));  // Ωράρια υπαλλήλων
app.use('/api/services', packageRoutes(pool));            // Πακέτα υπηρεσιών
app.use('/api/appointments', appointmentsRoutes(pool));   // Ραντεβού

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error('Global error handler:', err.stack);
  res.status(500).json({ message: 'Internal server error', error: err.message });
});

// Optional: Capture process termination signals
process.on('SIGTERM', () => {
  console.log('Process received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Process received SIGINT (Ctrl+C), shutting down gracefully');
  process.exit(0);
});

// Εκκίνηση του server
app.listen(port, () => {
  console.log(`✅ Server listening at http://localhost:${port}`);
});
