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
      const [result] = await pool.query(
        'INSERT INTO employees (name, business_id) VALUES (?, ?)',
        [name, businessId]
      );
      res.status(201).json({ id: result.insertId, name, message: 'Ο υπάλληλος προστέθηκε' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Σφάλμα κατά την προσθήκη υπαλλήλου' });
    }
  });

  // 🟢 Λήψη υπαλλήλων για το business
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

  // 👇 ΝΕΟ: Διαγραφή υπαλλήλου
  /**
   * @route DELETE /api/employees/:employeeId
   * @desc Διαγραφή ενός υπαλλήλου και των ανατεθειμένων υπηρεσιών του.
   * @access Private
   */
router.delete('/:employeeId', verifyToken, async (req, res) => {
  const { employeeId } = req.params;
  const businessId = req.businessId;

  try {
    // 1. Ελέγχουμε αν ο υπάλληλος ανήκει στην επιχείρηση
    const [employeeCheck] = await pool.query(
      'SELECT id FROM employees WHERE id = ? AND business_id = ?',
      [employeeId, businessId]
    );
    if (employeeCheck.length === 0) {
      return res.status(404).json({ message: 'Ο υπάλληλος δεν βρέθηκε ή δεν έχετε εξουσιοδότηση.' });
    }

    // 2. Διαγράφουμε πρώτα όλες τις αναθέσεις υπηρεσιών που έχει ο υπάλληλος
    await pool.query('DELETE FROM employee_services WHERE employee_id = ?', [employeeId]);

    // 3. Διαγράφουμε τον υπάλληλο
    const [result] = await pool.query('DELETE FROM employees WHERE id = ?', [employeeId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Ο υπάλληλος δεν βρέθηκε.' });
    }

    res.status(200).json({ message: 'Ο υπάλληλος διαγράφηκε επιτυχώς.' });
  } catch (err) {
    console.error('Error deleting employee:', err);
    res.status(500).json({ message: 'Σφάλμα κατά τη διαγραφή υπαλλήλου.' });
  }
});
  // 👇 ΝΕΟ: Επεξεργασία υπαλλήλου
  /**
   * @route PUT /api/employees/:employeeId
   * @desc Ενημέρωση των στοιχείων ενός υπαλλήλου (π.χ. ονόματος).
   * @access Private
   */
  router.put('/:employeeId', verifyToken, async (req, res) => {
    const { employeeId } = req.params;
    const { name } = req.body; // Υποθέτουμε ότι μόνο το όνομα μπορεί να επεξεργαστεί
    const businessId = req.businessId;

    if (!name || name.trim() === '') {
      return res.status(400).json({ message: 'Το όνομα είναι υποχρεωτικό για την ενημέρωση.' });
    }

    try {
      // ✅ Ελέγχει αν ο υπάλληλος ανήκει στην επιχείρηση
      const [employeeCheck] = await pool.query(
        'SELECT id FROM employees WHERE id = ? AND business_id = ?',
        [employeeId, businessId]
      );

      if (employeeCheck.length === 0) {
        return res.status(404).json({ message: 'Ο υπάλληλος δεν βρέθηκε ή δεν έχετε εξουσιοδότηση.' });
      }

      // 🔄 Ενημερώνουμε το όνομα του υπαλλήλου
      const [result] = await pool.query(
        'UPDATE employees SET name = ? WHERE id = ? AND business_id = ?',
        [name, employeeId, businessId]
      );

      if (result.affectedRows === 0) {
        // Αυτό σημαίνει ότι ο υπάλληλος δεν βρέθηκε ή δεν ενημερώθηκε
        return res.status(404).json({ message: 'Ο υπάλληλος δεν βρέθηκε ή δεν ενημερώθηκε.' });
      }

      res.status(200).json({ id: employeeId, name, message: 'Ο υπάλληλος ενημερώθηκε επιτυχώς.' });
    } catch (err) {
      console.error('Error updating employee:', err);
      res.status(500).json({ message: 'Σφάλμα κατά την ενημέρωση υπαλλήλου.' });
    }
  });


  // 👇 ΔΙΑΔΡΟΜΕΣ ΓΙΑ ΑΝΑΘΕΣΗ ΥΠΗΡΕΣΙΩΝ (ΠΑΚΕΤΩΝ) ΣΕ ΥΠΑΛΛΗΛΟΥΣ (Αυτές παρέμειναν ως είχαν)👇

  /**
   * @route GET /api/employees/:employeeId/packages
   * @desc Ανάκτηση υπηρεσιών (πακέτων) που έχουν ανατεθεί σε έναν συγκεκριμένο υπάλληλο.
   * @access Private
   */
  router.get('/:employeeId/packages', verifyToken, async (req, res) => {
    const { employeeId } = req.params;
    const businessId = req.businessId;

    try {
      // ✅ Ελέγχει αν ο υπάλληλος ανήκει στην επιχείρηση
      const [employeeRows] = await pool.query(
        'SELECT id FROM employees WHERE id = ? AND business_id = ?',
        [employeeId, businessId]
      );
      if (employeeRows.length === 0) {
        return res.status(404).json({ message: 'Ο υπάλληλος δεν βρέθηκε ή δεν έχετε εξουσιοδότηση' });
      }

      // 🤝 Ανάκτηση όλων των υπηρεσιών που έχουν ανατεθεί σε αυτόν τον υπάλληλο
      const [assignedServices] = await pool.query(
        `SELECT s.id, s.title, s.price, s.duration
          FROM services s
          JOIN employee_services ep ON s.id = ep.service_id
          WHERE ep.employee_id = ? AND s.business_id = ?`,
        [employeeId, businessId]
      );

      res.status(200).json(assignedServices);
    } catch (error) {
      console.error('Error fetching assigned services for employee:', error);
      res.status(500).json({ message: 'Σφάλμα κατά την ανάκτηση ανατεθειμένων υπηρεσιών υπαλλήλου' });
    }
  });

  /**
   * @route POST /api/employees/:employeeId/packages
   * @desc Ανάθεση/ενημέρωση υπηρεσιών (πακέτων) για έναν συγκεκριμένο υπάλληλο.
   * Αντικαθισθεί τις τρέχουσες αναθέσεις υπηρεσιών του υπαλλήλου με την παρεχόμενη λίστα.
   * @access Private
   */
  router.post('/:employeeId/packages', verifyToken, async (req, res) => {
    const { employeeId } = req.params;
    const { packageIds } = req.body;
    const businessId = req.businessId;

    if (!Array.isArray(packageIds)) {
      return res.status(400).json({ message: 'Τα ID υπηρεσιών πρέπει να είναι πίνακας' });
    }

    try {
      // ✅ Ελέγχει αν ο υπάλληλος ανήκει στην επιχείρηση
      const [employeeRows] = await pool.query(
        'SELECT id FROM employees WHERE id = ? AND business_id = ?',
        [employeeId, businessId]
      );
      if (employeeRows.length === 0) {
        return res.status(404).json({ message: 'Ο υπάλληλος δεν βρέθηκε ή δεν έχετε εξουσιοδότηση' });
      }

      // 🗑 Διαγράφουμε όλες τις υπάρχουσες αναθέσεις για αυτόν τον υπάλληλο
      await pool.query('DELETE FROM employee_services WHERE employee_id = ?', [employeeId]);

      // ➕ Εισάγουμε τις νέες αναθέσεις (αν υπάρχουν)
      if (packageIds.length > 0) {
        // ✅ Προαιρετικός έλεγχος: Βεβαιωθείτε ότι όλες οι υπηρεσίες ανήκουν στην ίδια επιχείρηση
        const [validServices] = await pool.query(
          'SELECT id FROM services WHERE id IN (?) AND business_id = ?',
          [packageIds, businessId]
        );
        if (validServices.length !== packageIds.length) {
          return res.status(400).json({ message: 'Ένα ή περισσότερα ID υπηρεσιών είναι μη έγκυρα ή δεν ανήκουν στην επιχείρησή σας' });
        }

        const values = packageIds.map(serviceId => [employeeId, serviceId]);
        await pool.query(
          'INSERT INTO employee_services (employee_id, service_id) VALUES ?',
          [values]
        );
      }

      res.status(200).json({ message: 'Οι υπηρεσίες υπαλλήλου ενημερώθηκαν επιτυχώς' });
    } catch (error) {
      console.error('Error updating employee services:', error);
      res.status(500).json({ message: 'Σφάλμα κατά την ενημέρωση υπηρεσιών υπαλλήλου' });
    }
  });

  return router;
}