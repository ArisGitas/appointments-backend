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

  return router;
}
