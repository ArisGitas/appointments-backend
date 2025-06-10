import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// Βεβαιωθείτε ότι το JWT_SECRET είναι διαθέσιμο μέσω μεταβλητής περιβάλλοντος
// Αν όχι, χρησιμοποιήστε μια ισχυρή, τυχαία τιμή για την ανάπτυξη,
// αλλά ΠΟΤΕ μην την αφήνετε έτσι σε παραγωγή.
const JWT_SECRET = process.env.JWT_SECRET || 'SUPER_DIP_SECRET_KEY_PLEASE_CHANGE_ME_IN_PRODUCTION';

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

    // Βασικός έλεγχος επικύρωσης
    if (!name || !email || !password || !phone || !address || !category) {
      return res.status(400).json({ message: 'Όλα τα πεδία είναι υποχρεωτικά.' });
    }

    try {
      // Έλεγχος αν υπάρχει ήδη email
      const [existing] = await pool.query('SELECT id FROM businesses WHERE email = ?', [email]);
      if (existing.length > 0) {
        return res.status(400).json({ message: 'Το email χρησιμοποιείται ήδη.' });
      }

      // Κρυπτογράφηση κωδικού
      const hashedPassword = await bcrypt.hash(password, 10);

      // Εισαγωγή επιχείρησης στη βάση δεδομένων
      const [result] = await pool.query(
        `INSERT INTO businesses (name, email, password, phone, address, category)
           VALUES (?, ?, ?, ?, ?, ?)`,
        [name, email, hashedPassword, phone, address, category]
      );

      // Παίρνουμε το ID της επιχείρησης που μόλις δημιουργήθηκε
      const businessId = result.insertId;

      // Εισαγωγή υπαλλήλων και ωραρίων
      if (Array.isArray(employees)) {
        for (const emp of employees) {
          const { name: empName, schedule } = emp;

          if (!empName) continue; // Παράλειψη αν δεν υπάρχει όνομα υπαλλήλου

          // Εισαγωγή υπαλλήλου
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

                  // Εισαγωγή μόνο αν έχουμε έγκυρο "από" και "έως" ωράριο
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
          // Μπορείτε να προσθέσετε πιο αυστηρούς ελέγχους εδώ (π.χ. price > 0)
          if (!title || !price || !duration) continue;

          await pool.query(
            `INSERT INTO services (business_id, title, price, duration)
             VALUES (?, ?, ?, ?)`,
            [businessId, title, price, duration]
          );
        }
      }

      // *** Η ΣΗΜΑΝΤΙΚΗ ΔΙΟΡΘΩΣΗ ΕΔΩ: Δημιουργία και επιστροφή JWT token ***
      const token = jwt.sign({ id: businessId, email: email }, JWT_SECRET, {
        expiresIn: '2h', // Το token λήγει σε 2 ώρες
      });

      // Επιτυχής απάντηση με token και businessId
      res.status(201).json({ message: 'Εγγραφή επιτυχής!', token, businessId });

    } catch (err) {
      console.error('Σφάλμα κατά την εγγραφή επιχείρησης:', err);
      res.status(500).json({ message: 'Σφάλμα στον server κατά την εγγραφή.' });
    }
  });

  // Endpoint Σύνδεσης (Login) - Παραμένει το ίδιο, καθώς ήταν ήδη σωστό
  router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
      const [users] = await pool.query('SELECT * FROM businesses WHERE email = ?', [email]);

      if (users.length === 0) {
        return res.status(400).json({ message: 'Λανθασμένο email ή κωδικός.' });
      }

      const business = users[0];
      const match = await bcrypt.compare(password, business.password);

      if (!match) {
        return res.status(400).json({ message: 'Λανθασμένο email ή κωδικός.' });
      }

      const token = jwt.sign({ id: business.id, email: business.email }, JWT_SECRET, {
        expiresIn: '2h', // Το token λήγει σε 2 ώρες
      });

      // Επιτυχής απάντηση με token και businessId
      res.json({ message: 'Επιτυχής είσοδος!', token, businessId: business.id });

    } catch (err) {
      console.error('Σφάλμα κατά τη σύνδεση:', err);
      res.status(500).json({ message: 'Σφάλμα στον server κατά τη σύνδεση.' });
    }
  });

  return router;
}