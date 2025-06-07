// routes/employeeSchedule.js
import express from 'express';
import verifyToken from '../middleware/verifyToken.js';

export default function (pool) {
  const router = express.Router();

  // 🔄 Αποθήκευση (ή αντικατάσταση) ωραρίου υπαλλήλου
  router.post('/:employeeId/schedule', verifyToken, async (req, res) => {
    const { employeeId } = req.params;
    const { schedule } = req.body; // schedule = { 'Δευτέρα': [{ from: '09:00', to: '13:00' }, ...], ... }
    const businessId = req.businessId;

    try {
      // ✅ Ελέγχει αν ο υπάλληλος ανήκει στην επιχείρηση
      const [employeeRows] = await pool.query(
        'SELECT id FROM employees WHERE id = ? AND business_id = ?',
        [employeeId, businessId]
      );
      if (employeeRows.length === 0) {
        return res.status(404).json({ message: 'Ο υπάλληλος δεν βρέθηκε' });
      }

      // 🗑 Διαγράφουμε το υπάρχον ωράριο
      await pool.query('DELETE FROM employee_schedule_slots WHERE employee_id = ?', [employeeId]);

      // ➕ Εισάγουμε τα νέα slots
      const values = [];
      for (const day in schedule) {
        const slots = schedule[day];
        if (Array.isArray(slots)) {
          for (const { from, to } of slots) {
            values.push([employeeId, day, from, to]);
          }
        }
      }

      if (values.length > 0) {
        await pool.query(
          'INSERT INTO employee_schedule_slots (employee_id, day_of_week, from_hour, to_hour) VALUES ?',
          [values]
        );
      }

      res.status(200).json({ message: 'Το ωράριο αποθηκεύτηκε επιτυχώς' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Σφάλμα κατά την αποθήκευση ωραρίου' });
    }
  });

  // 📥 Ανάκτηση ωραρίου υπαλλήλου
  router.get('/:employeeId/schedule', verifyToken, async (req, res) => {
    const { employeeId } = req.params;
    const businessId = req.businessId;

    try {
      const [employeeRows] = await pool.query(
        'SELECT id FROM employees WHERE id = ? AND business_id = ?',
        [employeeId, businessId]
      );
      if (employeeRows.length === 0) {
        return res.status(404).json({ message: 'Ο υπάλληλος δεν βρέθηκε' });
      }

      const [rows] = await pool.query(
        'SELECT day_of_week, from_hour, to_hour FROM employee_schedule_slots WHERE employee_id = ?',
        [employeeId]
      );

      // Μετατροπή σε format: { 'Δευτέρα': [ { from, to }, ... ], ... }
      const schedule = {};
      for (const { day_of_week, from_hour, to_hour } of rows) {
        if (!schedule[day_of_week]) schedule[day_of_week] = [];
        schedule[day_of_week].push({
          from: from_hour.slice(0, 5), // 'HH:MM'
          to: to_hour.slice(0, 5),
        });
      }

      res.status(200).json(schedule);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Σφάλμα κατά την ανάκτηση ωραρίου' });
    }
  });

  return router;
}
