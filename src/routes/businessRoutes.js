import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';

export default function(pool) {
  const router = express.Router();

  // 🟢 Εγγραφή επιχείρησης
  router.post('/register', async (req, res) => {
    const { name, email, password } = req.body;

    try {
      const [existing] = await pool.query('SELECT id FROM businesses WHERE email = ?', [email]);

      if (existing.length > 0) {
        return res.status(400).json({ message: 'Το email χρησιμοποιείται ήδη' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      await pool.query(
        'INSERT INTO businesses (name, email, password) VALUES (?, ?, ?)',
        [name, email, hashedPassword]
      );

      res.status(201).json({ message: 'Εγγραφή επιτυχής' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Σφάλμα στον server' });
    }
  });

  // 🟡 Login επιχείρησης
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

      res.json({ message: 'Επιτυχής είσοδος', token });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Σφάλμα στον server' });
    }
  });

  return router;
}
