import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// Βεβαιωθείτε ότι το JWT_SECRET φορτώνεται σωστά από τις μεταβλητές περιβάλλοντος
const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key_please_change_in_production'; // Χρησιμοποιήστε ένα ισχυρό μυστικό κλειδί

export default function (pool) {
  const router = express.Router();

  // 🟢 Εγγραφή επιχείρησης
  router.post('/register', async (req, res) => {
    const { name, email, password, phone, address, category } = req.body;

    if (!name || !email || !password || !phone || !address || !category) {
      return res.status(400).json({ message: 'Όλα τα πεδία είναι υποχρεωτικά' });
    }

    try {
      const [existing] = await pool.query('SELECT id FROM businesses WHERE email = ?', [email]);

      if (existing.length > 0) {
        return res.status(400).json({ message: 'Το email χρησιμοποιείται ήδη' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      // Εισαγωγή της επιχείρησης και λήψη του insertId
      const [result] = await pool.query(
        `INSERT INTO businesses (name, email, password, phone, address, category)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [name, email, hashedPassword, phone, address, category]
      );

      const businessId = result.insertId; // Παίρνουμε το ID της νεοδημιουργηθείσας επιχείρησης

      // Δημιουργία JWT token για την νέα επιχείρηση
      const token = jwt.sign({ id: businessId, email: email }, JWT_SECRET, {
        expiresIn: '2h', // Το token λήγει σε 2 ώρες
      });

      // Επιστροφή επιτυχούς απάντησης με token και businessId
      res.status(201).json({ 
        message: 'Εγγραφή επιτυχής',
        token,         // Επιστρέφουμε το token
        businessId     // Επιστρέφουμε το businessId
      });

    } catch (err) {
      console.error('Registration error:', err); // Λεπτομερέστερο error logging
      res.status(500).json({ message: 'Σφάλμα στον server κατά την εγγραφή' });
    }
  });

  // 🟡 Login επιχείρησης (παραμένει ίδιο)
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
      console.error('Login error:', err); // Λεπτομερέστερο error logging
      res.status(500).json({ message: 'Σφάλμα στον server κατά τη σύνδεση' });
    }
  });

  return router;
}
