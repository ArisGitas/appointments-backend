import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';

export default function (pool) {
  const router = express.Router();

  // Εγγραφή επιχείρησης με υπαλλήλους και υπηρεσίες
  router.post('/register', async (req, res) => {
    const {
      name,
      email,
      password,
      phone,
      address,
      category,
      employees,
      services,
    } = req.body;

    if (!name || !email || !password || !phone || !address || !category) {
      return res.status(400).json({ message: 'Όλα τα πεδία είναι υποχρεωτικά' });
    }

    try {
      // Έλεγχος αν υπάρχει ήδη email
      const [existing] = await pool.query('SELECT id FROM businesses WHERE email = ?', [email]);
      if (existing.length > 0) {
        return res.status(400).json({ message: 'Το email χρησιμοποιείται ήδη' });
      }

      // Κρυπτογράφηση κωδικού
      const hashedPassword = await bcrypt.hash(password, 10);

      // Εισαγωγή επιχείρησης
      const [result] = await pool.query(
        `INSERT INTO businesses (name, email, password, phone, address, category)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [name, email, hashedPassword, phone, address, category]
      );

      const businessId = result.insertId;

      // Εισαγωγή υπαλλήλων και ωραρίων
      if (Array.isArray(employees)) {
        for (const emp of employees) {
          const { name: empName, schedule } = emp;

          if (!empName) continue; // Skip if no employee name

          // Εισαγωγή υπαλλήλου στον πίνακα employees
          const [empResult] = await pool.query(
            `INSERT INTO employees (business_id, name) VALUES (?, ?)`,
            [businessId, empName]
          );

          const employeeId = empResult.insertId;

          // Εισαγωγή ωραρίων για κάθε μέρα
          if (schedule && typeof schedule === 'object') {
            for (const day in schedule) {
              const slots = schedule[day];
              if (Array.isArray(slots)) {
                for (const slot of slots) {
                  const from = slot.from || null;
                  const to = slot.to || null;

                  // Εισαγωγή μόνο αν έχουμε από και έως (μπορείς να προσθέσεις παραπάνω validation)
                  if (from && to) {
                    await pool.query(
                      `INSERT INTO employee_schedule_slots (employee_id, day_of_week, from_hour, to_hour)
                       VALUES (?, ?, ?, ?)`,
                      [employeeId, day, from, to]
                    );
                  }
                }
              }
            }
          }
        }
      }

      // Εισαγωγή υπηρεσιών
      if (Array.isArray(services)) {
        for (const svc of services) {
          const { title, price, duration } = svc;
          if (!title || !price || !duration) continue;

          await pool.query(
            `INSERT INTO services (business_id, title, price, duration)
             VALUES (?, ?, ?, ?)`,
            [businessId, title, price, duration]
          );
        }
      }

      res.status(201).json({ message: 'Εγγραφή επιτυχής', businessId });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Σφάλμα στον server' });
    }
  });

  // Login (ίδιο με πριν)
  router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
      const [users] = await pool.query('SELECT * FROM businesses WHERE email = ?', [email]);

      if (users.length === 0) {
        return res.status(400).json({ message: 'Λανθασμένο email ή κωδικός' });
      }

      const business = users[0];
      const match = await bcrypt.compare(password, business.password);

      if (!match) {
        return res.status(400).json({ message: 'Λανθασμένο email ή κωδικός' });
      }

      const token = jwt.sign({ id: business.id, email: business.email }, JWT_SECRET, {
        expiresIn: '2h',
      });

      res.json({ message: 'Επιτυχής είσοδος', token, businessId: business.id });

    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Σφάλμα στον server' });
    }
  });

  return router;
}
