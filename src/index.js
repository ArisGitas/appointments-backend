import express from 'express';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import cors from 'cors';

// Import all your route files
import businessRoutes from './routes/businessRoutes.js';
import employeeRoutes from './routes/employees.js';
import employeeScheduleRoutes from './routes/employeeSchedule.js';
import packageRoutes from './routes/packageRoutes.js';
import appointmentsRoutes from './routes/appointments.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3333;

app.use(cors());
app.use(express.json());

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
    res.json({ message: 'DB Connected!', serverTime: rows[0].now });
  } catch (error) {
    console.error('❌ DB Error:', error);
    res.status(500).json({ message: 'DB connection failed', error: error.message });
  }
});

// 🧭 Use your routes
app.use('/api/business', businessRoutes(pool));
app.use('/api/employees', employeeRoutes(pool));
app.use('/api/employees', employeeScheduleRoutes(pool));
app.use('/api/services', packageRoutes(pool));
app.use('/api/appointments', appointmentsRoutes(pool));

// 🚀 Start the server
app.listen(port, () => {
  console.log(`✅ Server listening at http://localhost:${port}`);
});