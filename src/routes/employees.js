import express from 'express';
import verifyToken from '../middleware/verifyToken.js'; // Υποθέτουμε ότι υπάρχει αυτό το middleware

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
      const [result] = await pool.query( // Added result capture to get insertId
        'INSERT INTO employees (name, business_id) VALUES (?, ?)',
        [name, businessId]
      );
      res.status(201).json({ id: result.insertId, name, message: 'Ο υπάλληλος προστέθηκε' }); // Return ID
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

  // 👇 ΝΕΕΣ ΔΙΑΔΡΟΜΕΣ ΓΙΑ ΑΝΑΘΕΣΗ ΠΑΚΕΤΩΝ ΣΕ ΥΠΑΛΛΗΛΟΥΣ 👇

  /**
   * @route GET /api/employees/:employeeId/packages
   * @desc Ανάκτηση πακέτων που έχουν ανατεθεί σε έναν συγκεκριμένο υπάλληλο.
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

      // 🤝 Ανάκτηση όλων των πακέτων που έχουν ανατεθεί σε αυτόν τον υπάλληλο
      const [assignedPackages] = await pool.query(
        `SELECT p.id, p.title, p.price, p.duration
         FROM packages p
         JOIN employee_packages ep ON p.id = ep.package_id
         WHERE ep.employee_id = ? AND p.business_id = ?`,
        [employeeId, businessId]
      );

      res.status(200).json(assignedPackages);
    } catch (error) {
      console.error('Error fetching assigned packages for employee:', error);
      res.status(500).json({ message: 'Σφάλμα κατά την ανάκτηση ανατεθειμένων πακέτων υπαλλήλου' });
    }
  });

  /**
   * @route POST /api/employees/:employeeId/packages
   * @desc Ανάθεση/ενημέρωση πακέτων για έναν συγκεκριμένο υπάλληλο.
   * Αντικαθιστά τις τρέχουσες αναθέσεις πακέτων του υπαλλήλου με την παρεχόμενη λίστα.
   * @access Private
   */
  router.post('/:employeeId/packages', verifyToken, async (req, res) => {
    const { employeeId } = req.params;
    const { packageIds } = req.body; // Πίνακας με IDs πακέτων
    const businessId = req.businessId;

    if (!Array.isArray(packageIds)) {
      return res.status(400).json({ message: 'Τα Package IDs πρέπει να είναι πίνακας' });
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
      await pool.query('DELETE FROM employee_packages WHERE employee_id = ?', [employeeId]);

      // ➕ Εισάγουμε τις νέες αναθέσεις (αν υπάρχουν)
      if (packageIds.length > 0) {
        // ✅ Προαιρετικός έλεγχος: Βεβαιωθείτε ότι όλα τα packageIds ανήκουν στην ίδια επιχείρηση
        const [validPackages] = await pool.query(
          'SELECT id FROM packages WHERE id IN (?) AND business_id = ?',
          [packageIds, businessId]
        );
        if (validPackages.length !== packageIds.length) {
          return res.status(400).json({ message: 'Ένα ή περισσότερα ID πακέτων είναι μη έγκυρα ή δεν ανήκουν στην επιχείρησή σας' });
        }

        const values = packageIds.map(pkgId => [employeeId, pkgId]);
        await pool.query(
          'INSERT INTO employee_packages (employee_id, package_id) VALUES ?',
          [values]
        );
      }

      res.status(200).json({ message: 'Τα πακέτα υπαλλήλου ενημερώθηκαν επιτυχώς' });
    } catch (error) {
      console.error('Error updating employee packages:', error);
      res.status(500).json({ message: 'Σφάλμα κατά την ενημέρωση πακέτων υπαλλήλου' });
    }
  });

  return router;
}
