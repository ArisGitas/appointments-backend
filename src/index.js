import express from 'express';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import cors from 'cors';

// Import all your route files
import businessRoutes from './routes/businessRoutes.js';
import employeeRoutes from './routes/employees.js'; // Υποθέτουμε ότι αυτό το αρχείο περιέχει τις διαδρομές υπαλλήλων (συμπεριλαμβανομένης της ανάθεσης πακέτων)
import employeeScheduleRoutes from './routes/employeeSchedule.js'; // Διαδρομές για το ωράριο υπαλλήλων
import packageRoutes from './routes/packageRoutes.js'; // Διαδρομές για τη διαχείριση πακέτων

dotenv.config();

const app = express();
const port = process.env.PORT || 3333;

app.use(cors()); // Enable CORS for all origins
app.use(express.json()); // Middleware to parse JSON request bodies

// 🔌 Create a database connection pool
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

// 🔎 Test endpoint for database connection
app.get('/test-db', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT NOW() AS now');
    // ✅ Αλλαγή από res.send() σε res.json() για συνεπείς JSON απαντήσεις
    res.json({ message: 'DB Connected!', serverTime: rows[0].now });
  } catch (error) {
    console.error('❌ DB Error:', error);
    // ✅ Αλλαγή από res.send() σε res.json() για συνεπείς JSON απαντήσεις
    res.status(500).json({ message: 'DB connection failed', error: error.message });
  }
});

// 🧭 Use your routes
app.use('/api/business', businessRoutes(pool)); // Business related routes
app.use('/api/employees', employeeRoutes(pool)); // Employee related routes (including package assignments for employees)
app.use('/api/employees', employeeScheduleRoutes(pool)); // Employee schedule related routes
app.use('/api/packages', packageRoutes(pool)); // Package management related routes

// 🚀 Start the server
app.listen(port, () => {
  console.log(`✅ Server listening at http://localhost:${port}`);
});
