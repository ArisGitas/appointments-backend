import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';

export default function (pool) {
  const router = express.Router();

  router.post('/register', async (req, res) => {
    const {
      name, email, password, phone, address, category,
      employees = [], // από frontend
      services = []
    } = req.body;

    // Έλεγχος υποχρεωτικών πεδίων επιχείρησης
    if (!name || !email || !password || !phone || !address || !category) {
      return res.status(400).json({ message: 'Όλα τα πεδία είναι υποχρεωτικά' });
    }

    try {
      // Έλεγχος αν υπάρχει ήδη το email
      const [existing] = await pool.query('SELECT id FROM businesses WHERE email = ?', [email]);
      if (existing.length > 0) {
        return res.status(400).json({ message: 'Το email χρησιμοποιείται ήδη' });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Εισαγωγή επιχείρησης
      const [result] = await pool.query(
        `INSERT INTO businesses (name, email, password, phone, address, category)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [name, email, hashedPassword, phone, address, category]
      );

      const businessId = result.insertId;

      // Εισαγωγή υπαλλήλων και ωραρίων
      for (const emp of employees) {
        const { name: empName, schedule } = emp;
        if (!empName) continue;

        const [empResult] = await pool.query(
          'INSERT INTO employees (business_id, name) VALUES (?, ?)',
          [businessId, empName]
        );

        const employeeId = empResult.insertId;

        // schedule είναι αντικείμενο { day: [{from, to}, ...], ... }
        if (schedule && typeof schedule === 'object') {
          for (const day of Object.keys(schedule)) {
            const slots = schedule[day];
            if (!Array.isArray(slots)) continue;

            for (const slot of slots) {
              const fromTime = slot.from || null;
              const toTime = slot.to || null;

              // Αν υπάρχουν έγκυρες ώρες, εισαγωγή
              if (fromTime && toTime) {
                await pool.query(
                  `INSERT INTO employee_schedules (employee_id, day, from_time, to_time)
                   VALUES (?, ?, ?, ?)`,
                  [employeeId, day, fromTime, toTime]
                );
              }
            }
          }
        }
      }

      // Εισαγωγή υπηρεσιών
      for (const svc of services) {
        const { title, price, duration } = svc;
        if (!title || price == null || duration == null) continue;

        await pool.query(
          `INSERT INTO services (business_id, title, price, duration)
           VALUES (?, ?, ?, ?)`,
          [businessId, title, price, duration]
        );
      }

      // Δημιουργία JWT token
      const token = jwt.sign({ id: businessId, email }, JWT_SECRET, { expiresIn: '2h' });

      res.status(201).json({ message: 'Εγγραφή επιτυχής', token, businessId });

    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Σφάλμα στον server' });
    }
  });

  return router;
}
