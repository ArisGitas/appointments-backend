import express from 'express';
import verifyToken from '../middleware/verifyToken.js';

export default function (pool) {
  const router = express.Router();

  // ➕ Προσθήκη υπαλλήλου
  router.post('/add', verifyToken, async (req, res) => {
    const { name } = req.body;
    const businessId = req.businessId;

    if (!name) {
      return res.status(400).json({ message: 'Το όνομα είναι υποχρεωτικό' });
    }

    try {
      await pool.query(
        'INSERT INTO employees (name, business_id) VALUES (?, ?)',
        [name, businessId]
      );
      res.status(201).json({ message: 'Ο υπάλληλος προστέθηκε' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Σφάλμα κατά την προσθήκη υπαλλήλου' });
    }
  });

  // 🟢 ΝΕΟ: Λήψη υπαλλήλων για το business
  router.get('/', verifyToken, async (req, res) => {
    const businessId = req.businessId;

    try {
      const [rows] = await pool.query(
        'SELECT id, name FROM employees WHERE business_id = ?',
        [businessId]
      );

      res.status(200).json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Σφάλμα κατά την λήψη υπαλλήλων' });
    }
  });

  return router;
}
