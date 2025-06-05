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
      const [employeeCheck] = await pool.query(
        'SELECT * FROM employees WHERE id = ? AND business_id = ?',
        [employeeId, businessId]
      );

      if (employeeCheck.length === 0) {
        return res.status(404).json({ message: 'Ο υπάλληλος δεν βρέθηκε' });
      }

      await pool.query('DELETE FROM schedules WHERE employee_id = ?', [employeeId]);

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

  // 📥 Ανάκτηση σπαστού ωραρίου υπαλλήλου
  router.get('/:employeeId', verifyToken, async (req, res) => {
    const businessId = req.businessId;
    const { employeeId } = req.params;

    try {
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

  // 🔹 Ανάκτηση ωραρίου ως απλές ώρες (για κουτάκια)
  router.get('/:employeeId/schedule-hours', verifyToken, async (req, res) => {
    const businessId = req.businessId;
    const { employeeId } = req.params;

    try {
      const [employeeCheck] = await pool.query(
        'SELECT * FROM employees WHERE id = ? AND business_id = ?',
        [employeeId, businessId]
      );

      if (employeeCheck.length === 0) {
        return res.status(404).json({ message: 'Ο υπάλληλος δεν βρέθηκε' });
      }

      const [rows] = await pool.query(
        'SELECT day_of_week, start_time FROM schedules WHERE employee_id = ? AND is_available = true ORDER BY day_of_week, start_time',
        [employeeId]
      );

      const schedule = {};

      for (const row of rows) {
        const day = parseInt(row.day_of_week);
        const hour = row.start_time.substring(0, 5); // "08:00"

        if (!schedule[day]) schedule[day] = [];
        schedule[day].push(hour);
      }

      res.status(200).json(schedule);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Σφάλμα κατά την ανάκτηση ωραρίου' });
    }
  });

  // 🔸 Αποθήκευση απλών ωρών ανά ημέρα (από κουτάκια)
  router.post('/:employeeId/schedule-hours', verifyToken, async (req, res) => {
    const businessId = req.businessId;
    const { employeeId } = req.params;
    const schedule = req.body.schedule;

    if (!schedule || typeof schedule !== 'object') {
      return res.status(400).json({ message: 'Μη έγκυρο schedule' });
    }

    try {
      const [employeeCheck] = await pool.query(
        'SELECT * FROM employees WHERE id = ? AND business_id = ?',
        [employeeId, businessId]
      );

      if (employeeCheck.length === 0) {
        return res.status(404).json({ message: 'Ο υπάλληλος δεν βρέθηκε' });
      }

      await pool.query('DELETE FROM schedules WHERE employee_id = ?', [employeeId]);
      console.log('SCHEDULE RECEIVED:', schedule);


      for (const [dayStr, hours] of Object.entries(schedule)) {
        const day = parseInt(dayStr);

        for (const hour of hours) {
          const [h] = hour.split(':');
          const startTime = `${h.padStart(2, '0')}:00:00`;
          const endHour = String(Number(h) + 1).padStart(2, '0');
          const endTime = `${endHour}:00:00`;

          await pool.query(
            'INSERT INTO schedules (employee_id, day_of_week, start_time, end_time, is_available) VALUES (?, ?, ?, ?, ?)',
            [employeeId, day, startTime, endTime, true]
          );
        }
      }

      res.status(200).json({ message: 'Το ωράριο αποθηκεύτηκε' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Σφάλμα κατά την αποθήκευση ωραρίου' });
    }
  });

  return router;
}
