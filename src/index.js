import express from 'express';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import cors from 'cors';
import businessRoutes from './routes/businessRoutes.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3333;

app.use(cors());
app.use(express.json());

// Δημιουργία σύνδεσης με βάση
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: process.env.MYSQL_PORT,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
});

// Δοκιμαστικό endpoint
app.get('/test-db', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT NOW() AS now');
    res.send(`✅ DB Connected! Server time: ${rows[0].now}`);
  } catch (error) {
    console.error('❌ DB Error:', error);
    res.status(500).send('DB connection failed');
  }
});

// Χρήση των routes
app.use('/api/business', businessRoutes(pool));

app.listen(port, () => {
  console.log(`✅ Server listening at http://localhost:${port}`);
});
