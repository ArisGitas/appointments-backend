import express from 'express';
import verifyToken from '../middleware/verifyToken.js';

export default function (pool) {
  const router = express.Router();

  // ➕ Δημιουργία ή ενημέρωση ωραρίου υπαλλήλου για μια ημέρα (με σπαστό ωράριο)
  router.post('/set', verifyToken, async (req, res) => {
    const businessId = req.businessId;
    const { employeeId, schedules } = req.body;

    if (!employeeId || !Array.isArray(schedules)) {
      return res.status(400).json({ message: 'Λείπουν δεδομένα' });
    }

    try {
      // Βεβαιωνόμαστε ότι ο υπάλληλος ανήκει στην επιχείρηση
      const [employeeCheck] = await pool.query(
        'SELECT * FROM employees WHERE id = ? AND business_id = ?',
        [employeeId, businessId]
      );

      if (employeeCheck.length === 0) {
        return res.status(404).json({ message: 'Ο υπάλληλος δεν βρέθηκε' });
      }

      // Διαγράφουμε όλα τα υπάρχοντα ωράρια του υπαλλήλου
      await pool.query('DELETE FROM schedules WHERE employee_id = ?', [employeeId]);

      // Εισάγουμε το νέο ωράριο (υποστηρίζει πολλά blocks ανά ημέρα)
      for (const schedule of schedules) {
        const { dayOfWeek, intervals } = schedule;

        for (const interval of intervals) {
          const { startTime, endTime, isAvailable } = interval;

          if (!startTime || !endTime || !dayOfWeek) continue;

          await pool.query(
            'INSERT INTO schedules (employee_id, day_of_week, start_time, end_time, is_available) VALUES (?, ?, ?, ?, ?)',
            [employeeId, dayOfWeek, startTime, endTime, isAvailable ?? true]
          );
        }
      }

      res.status(200).json({ message: 'Το ωράριο ενημερώθηκε επιτυχώς' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Σφάλμα κατά την αποθήκευση ωραρίου' });
    }
  });

  // 📥 Ανάκτηση ωραρίου υπαλλήλου
  router.get('/:employeeId', verifyToken, async (req, res) => {
    const businessId = req.businessId;
    const { employeeId } = req.params;

    try {
      // Έλεγχος αν ο υπάλληλος ανήκει στην επιχείρηση
      const [employeeCheck] = await pool.query(
        'SELECT * FROM employees WHERE id = ? AND business_id = ?',
        [employeeId, businessId]
      );

      if (employeeCheck.length === 0) {
        return res.status(404).json({ message: 'Ο υπάλληλος δεν βρέθηκε' });
      }

      const [rows] = await pool.query(
        'SELECT day_of_week, start_time, end_time, is_available FROM schedules WHERE employee_id = ? ORDER BY day_of_week, start_time',
        [employeeId]
      );

      // Ομαδοποίηση κατά ημέρα
      const grouped = {};
      for (const row of rows) {
        const day = row.day_of_week;
        if (!grouped[day]) grouped[day] = [];

        grouped[day].push({
          startTime: row.start_time,
          endTime: row.end_time,
          isAvailable: row.is_available,
        });
      }

      // Μετατροπή σε array για frontend συμβατότητα
      const result = Object.entries(grouped).map(([dayOfWeek, intervals]) => ({
        dayOfWeek: Number(dayOfWeek),
        intervals,
      }));

      res.status(200).json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Σφάλμα κατά την ανάκτηση ωραρίου' });
    }
  });

  return router;
}
