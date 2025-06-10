import express from 'express';
import verifyToken from '../middleware/verifyToken.js'; // Υποθέτουμε ότι το verifyToken είναι στο φάκελο middleware

export default function (pool) {
  const router = express.Router();

  // GET /api/home/appointments/today
  // Ανάκτηση σημερινών ραντεβού για την επιχείρηση
  router.get('/appointments/today', verifyToken, async (req, res) => {
    const businessId = req.businessId; // Το businessId ανακτάται από το verifyToken middleware

    try {
      const [appointments] = await pool.query(
        `SELECT
           a.id, a.client_name, a.client_phone, a.appointment_date, a.start_time, a.end_time,
           s.title AS service_title,
           e.name AS employee_name
         FROM appointments a
         JOIN services s ON a.service_id = s.id
         JOIN employees e ON a.employee_id = e.id
         WHERE a.business_id = ? AND DATE(a.appointment_date) = CURDATE()
         ORDER BY a.start_time ASC`,
        [businessId]
      );
      res.json(appointments);
    } catch (err) {
      console.error('Σφάλμα ανάκτησης σημερινών ραντεβού:', err);
      res.status(500).json({ message: 'Σφάλμα server κατά την ανάκτηση ραντεβού.' });
    }
  });

  // GET /api/home/employees/count
  // Καταμέτρηση υπαλλήλων για την επιχείρηση
  router.get('/employees/count', verifyToken, async (req, res) => {
    const businessId = req.businessId;
    try {
      const [result] = await pool.query(
        'SELECT COUNT(*) AS count FROM employees WHERE business_id = ?',
        [businessId]
      );
      res.json({ count: result[0].count });
    } catch (err) {
      console.error('Σφάλμα ανάκτησης πλήθους υπαλλήλων:', err);
      res.status(500).json({ message: 'Σφάλμα server κατά την ανάκτηση πλήθους υπαλλήλων.' });
    }
  });

  // GET /api/home/services/count
  // Καταμέτρηση υπηρεσιών για την επιχείρηση
  router.get('/services/count', verifyToken, async (req, res) => {
    const businessId = req.businessId;
    try {
      const [result] = await pool.query(
        'SELECT COUNT(*) AS count FROM services WHERE business_id = ?',
        [businessId]
      );
      res.json({ count: result[0].count });
    } catch (err) {
      console.error('Σφάλμα ανάκτησης πλήθους υπηρεσιών:', err);
      res.status(500).json({ message: 'Σφάλμα server κατά την ανάκτηση πλήθους υπηρεσιών.' });
    }
  });

  return router;
}