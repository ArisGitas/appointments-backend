import express from 'express';
import verifyToken from '../middleware/verifyToken.js'; // Υποθέτουμε ότι υπάρχει αυτό το middleware

export default function (pool) {
  const router = express.Router();

  /**
   * @route GET /api/appointments
   * @desc Ανάκτηση όλων των ραντεβού για την αυθεντικοποιημένη επιχείρηση,
   * συμπεριλαμβανομένων των ονομάτων υπαλλήλων και των τίτλων υπηρεσιών.
   * @access Private
   */
  router.get('/', verifyToken, async (req, res) => {
    const businessId = req.businessId;

    try {
      const [rows] = await pool.query(
        `SELECT
            s.id,
            s.business_id,
            s.employee_id,
            e.name AS employee_name,   -- Όνομα υπαλλήλου
            s.service_id,
            svc.title AS service_title, -- Τίτλος υπηρεσίας
            svc.duration AS service_duration, -- Διάρκεια υπηρεσίας
            s.client_name,
            s.client_contact,
            s.appointment_datetime,
            s.appointment_end_datetime, -- ✅ Νέο πεδίο: Ώρα λήξης ραντεβού
            s.status,
            s.notes,
            s.created_at,
            s.updated_at
          FROM schedules s
          LEFT JOIN employees e ON s.employee_id = e.id
          LEFT JOIN services svc ON s.service_id = svc.id
          WHERE s.business_id = ?
          ORDER BY s.appointment_datetime ASC`,
        [businessId]
      );

      // Map results to match frontend structure (e.g., serviceId instead of service_id)
      const appointments = rows.map(row => ({
        id: row.id,
        businessId: row.business_id,
        employeeId: row.employee_id,
        employeeName: row.employee_name,
        serviceId: row.service_id,
        serviceTitle: row.service_title,
        serviceDuration: row.service_duration,
        clientName: row.client_name,
        clientContact: row.client_contact,
        appointmentDateTime: row.appointment_datetime, // MySQL DATETIME θα είναι JS Date object
        appointmentEndDateTime: row.appointment_end_datetime, // ✅ Νέο πεδίο
        status: row.status,
        notes: row.notes,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      res.status(200).json(appointments);
    } catch (error) {
      console.error('Error fetching appointments:', error);
      res.status(500).json({ message: 'Σφάλμα κατά την ανάκτηση ραντεβού' });
    }
  });

  /**
   * @route POST /api/appointments/add
   * @desc Προσθήκη νέου ραντεβού.
   * @access Private
   */
  router.post('/add', verifyToken, async (req, res) => {
    const { employeeId, serviceId, clientName, clientContact, appointmentDateTime, appointmentEndDateTime, status, notes } = req.body; // ✅ Νέο πεδίο: appointmentEndDateTime
    const businessId = req.businessId;

    if (!employeeId || !serviceId || !clientName || !appointmentDateTime) {
      return res.status(400).json({ message: 'Παρακαλώ συμπληρώστε όλα τα απαιτούμενα πεδία (υπάλληλος, υπηρεσία, πελάτης, ημερομηνία/ώρα έναρξης)' });
    }

    // Μετατροπή των ISO string σε αντικείμενα Date.
    const appointmentDateObject = new Date(appointmentDateTime);
    const appointmentEndDateObject = appointmentEndDateTime ? new Date(appointmentEndDateTime) : null; // ✅ Μετατροπή και του end_datetime

    // Έλεγχος για μη έγκυρη ημερομηνία έναρξης
    if (isNaN(appointmentDateObject.getTime())) {
        return res.status(400).json({ message: 'Μη έγκυρη μορφή ημερομηνίας/ώρας έναρξης ραντεβού.' });
    }
    // Έλεγχος για μη έγκυρη ημερομηνία λήξης αν παρέχεται
    if (appointmentEndDateObject && isNaN(appointmentEndDateObject.getTime())) {
        return res.status(400).json({ message: 'Μη έγκυρη μορφή ημερομηνίας/ώρας λήξης ραντεβού.' });
    }

    try {
      // 1. Verify employee belongs to the business
      const [employeeRows] = await pool.query(
        'SELECT id FROM employees WHERE id = ? AND business_id = ?',
        [employeeId, businessId]
      );
      if (employeeRows.length === 0) {
        return res.status(400).json({ message: 'Ο υπάλληλος δεν βρέθηκε ή δεν ανήκει στην επιχείρησή σας' });
      }

      // 2. Verify service belongs to the business
      const [serviceRows] = await pool.query(
        'SELECT id FROM services WHERE id = ? AND business_id = ?',
        [serviceId, businessId]
      );
      if (serviceRows.length === 0) {
        return res.status(400).json({ message: 'Η υπηρεσία δεν βρέθηκε ή δεν ανήκει στην επιχείρησή σας' });
      }

      const [result] = await pool.query(
        `INSERT INTO schedules
          (business_id, employee_id, service_id, client_name, client_contact, appointment_datetime, appointment_end_datetime, status, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [businessId, employeeId, serviceId, clientName, clientContact || null, appointmentDateObject, appointmentEndDateObject, status || 'booked', notes || null] // ✅ Προσθήκη appointmentEndDateObject
      );

      res.status(201).json({
        id: result.insertId,
        businessId,
        employeeId,
        serviceId,
        clientName,
        clientContact,
        appointmentDateTime,
        appointmentEndDateTime, // ✅ Νέο πεδίο στο response
        status: status || 'booked',
        notes,
        message: 'Το ραντεβού προστέθηκε επιτυχώς'
      });
    } catch (error) {
      console.error('Error adding appointment:', error);
      res.status(500).json({ message: 'Σφάλμα κατά την προσθήκη ραντεβού' });
    }
  });

  /**
   * @route PUT /api/appointments/:appointmentId
   * @desc Ενημέρωση υπάρχοντος ραντεβού.
   * @access Private
   */
  router.put('/:appointmentId', verifyToken, async (req, res) => {
    const { appointmentId } = req.params;
    const { employeeId, serviceId, clientName, clientContact, appointmentDateTime, appointmentEndDateTime, status, notes } = req.body; // ✅ Νέο πεδίο: appointmentEndDateTime
    const businessId = req.businessId;

    if (!employeeId || !serviceId || !clientName || !appointmentDateTime) {
      return res.status(400).json({ message: 'Παρακαλώ συμπληρώστε όλα τα απαιτούμενα πεδία (υπάλληλος, υπηρεσία, πελάτης, ημερομηνία/ώρα έναρξης)' });
    }

    // Μετατροπή των ISO string σε αντικείμενα Date.
    const appointmentDateObject = new Date(appointmentDateTime);
    const appointmentEndDateObject = appointmentEndDateTime ? new Date(appointmentEndDateTime) : null; // ✅ Μετατροπή και του end_datetime

    // Έλεγχος για μη έγκυρη ημερομηνία έναρξης
    if (isNaN(appointmentDateObject.getTime())) {
        return res.status(400).json({ message: 'Μη έγκυρη μορφή ημερομηνίας/ώρας έναρξης ραντεβού.' });
    }
    // Έλεγχος για μη έγκυρη ημερομηνία λήξης αν παρέχεται
    if (appointmentEndDateObject && isNaN(appointmentEndDateObject.getTime())) {
        return res.status(400).json({ message: 'Μη έγκυρη μορφή ημερομηνίας/ώρας λήξης ραντεβού.' });
    }

    try {
      // 1. Verify appointment belongs to the business
      const [appointmentRows] = await pool.query(
        'SELECT id FROM schedules WHERE id = ? AND business_id = ?',
        [appointmentId, businessId]
      );
      if (appointmentRows.length === 0) {
        return res.status(404).json({ message: 'Το ραντεβού δεν βρέθηκε ή δεν έχετε εξουσιοδότηση' });
      }

      // 2. Verify employee belongs to the business (if updated)
      const [employeeRows] = await pool.query(
        'SELECT id FROM employees WHERE id = ? AND business_id = ?',
        [employeeId, businessId]
      );
      if (employeeRows.length === 0) {
        return res.status(400).json({ message: 'Ο υπάλληλος δεν βρέθηκε ή δεν ανήκει στην επιχείρησή σας' });
      }

      // 3. Verify service belongs to the business (if updated)
      const [serviceRows] = await pool.query(
        'SELECT id FROM services WHERE id = ? AND business_id = ?',
        [serviceId, businessId]
      );
      if (serviceRows.length === 0) {
        return res.status(400).json({ message: 'Η υπηρεσία δεν βρέθηκε ή δεν ανήκει στην επιχείρησή σας' });
      }

      const [result] = await pool.query(
        `UPDATE schedules
          SET employee_id = ?, service_id = ?, client_name = ?, client_contact = ?, appointment_datetime = ?, appointment_end_datetime = ?, status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND business_id = ?`,
        [employeeId, serviceId, clientName, clientContact || null, appointmentDateObject, appointmentEndDateObject, status || 'booked', notes || null, appointmentId, businessId] // ✅ Προσθήκη appointmentEndDateObject
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Το ραντεβού δεν βρέθηκε για ενημέρωση' });
      }

      res.status(200).json({ message: 'Το ραντεβού ενημερώθηκε επιτυχώς' });
    } catch (error) {
      console.error('Error updating appointment:', error);
      res.status(500).json({ message: 'Σφάλμα κατά την ενημέρωση ραντεβού' });
    }
  });

  /**
   * @route DELETE /api/appointments/:appointmentId
   * @desc Ακύρωση/Διαγραφή ραντεβού.
   * @access Private
   */
  router.delete('/:appointmentId', verifyToken, async (req, res) => {
    const { appointmentId } = req.params;
    const businessId = req.businessId;

    try {
      // 1. Verify appointment belongs to the business
      const [appointmentRows] = await pool.query(
        'SELECT id FROM schedules WHERE id = ? AND business_id = ?',
        [appointmentId, businessId]
      );
      if (appointmentRows.length === 0) {
        return res.status(404).json({ message: 'Το ραντεβού δεν βρέθηκε ή δεν έχετε εξουσιοδότηση' });
      }

      // 2. Delete the appointment
      const [result] = await pool.query(
        'DELETE FROM schedules WHERE id = ? AND business_id = ?',
        [appointmentId, businessId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Το ραντεβού δεν βρέθηκε για διαγραφή' });
      }

      res.status(200).json({ message: 'Το ραντεβού διαγράφηκε επιτυχώς' });
    } catch (error) {
      console.error('Error deleting appointment:', error);
      res.status(500).json({ message: 'Σφάλμα κατά τη διαγραφή ραντεβού' });
    }
  });

  /**
   * @route POST /api/appointments/deleteOld
   * @desc Διαγραφή ραντεβού παλαιότερων από συγκεκριμένη ημερομηνία για την αυθεντικοποιημένη επιχείρηση.
   * @access Private
   */
  router.post('/deleteOld', verifyToken, async (req, res) => {
    const { cutoffDate } = req.body;
    const businessId = req.businessId;

    if (!cutoffDate) {
      return res.status(400).json({ message: 'Η ημερομηνία αποκοπής (cutoffDate) είναι απαραίτητη.' });
    }

    const cutoffDateObject = new Date(cutoffDate);

    if (isNaN(cutoffDateObject.getTime())) {
      return res.status(400).json({ message: 'Μη έγκυρη μορφή ημερομηνίας αποκοπής.' });
    }

    try {
      const [result] = await pool.query(
        'DELETE FROM schedules WHERE business_id = ? AND appointment_datetime < ?',
        [businessId, cutoffDateObject]
      );

      res.status(200).json({ message: `Διαγράφηκαν ${result.affectedRows} παλιά ραντεβού.` });
    } catch (error) {
      console.error('Error deleting old appointments:', error);
      res.status(500).json({ message: 'Σφάλμα κατά τη διαγραφή παλιών ραντεβού.' });
    }
  });

  return router;
}
