import express from 'express';
import verifyToken from '../middleware/verifyToken.js'; // Υποθέτουμε ότι υπάρχει αυτό το middleware

export default function (pool) {
  const router = express.Router();

  /**
   * @route GET /api/packages
   * @desc Ανάκτηση όλων των πακέτων για την αυθεντικοποιημένη επιχείρηση.
   * @access Private
   */
  router.get('/', verifyToken, async (req, res) => {
    const businessId = req.businessId;

    try {
      const [rows] = await pool.query(
        'SELECT id, title, price, duration FROM packages WHERE business_id = ?',
        [businessId]
      );
      res.status(200).json(rows);
    } catch (error) {
      console.error('Error fetching packages:', error);
      res.status(500).json({ message: 'Σφάλμα κατά την ανάκτηση πακέτων' });
    }
  });

  /**
   * @route POST /api/packages/add
   * @desc Προσθήκη νέου πακέτου.
   * @access Private
   */
  router.post('/add', verifyToken, async (req, res) => {
    const { title, price, duration } = req.body;
    const businessId = req.businessId;

    if (!title || !price || !duration) {
      return res.status(400).json({ message: 'Παρακαλώ συμπληρώστε όλα τα πεδία του πακέτου' });
    }
    if (isNaN(price) || parseFloat(price) <= 0 || isNaN(duration) || parseInt(duration) <= 0) {
      return res.status(400).json({ message: 'Η τιμή και η διάρκεια πρέπει να είναι θετικοί αριθμοί' });
    }

    try {
      const [result] = await pool.query(
        'INSERT INTO packages (title, price, duration, business_id) VALUES (?, ?, ?, ?)',
        [title, parseFloat(price), parseInt(duration), businessId]
      );

      // Επιστρέφουμε το ID του νέου πακέτου
      res.status(201).json({
        id: result.insertId, // Το ID που δημιουργήθηκε
        title,
        price: parseFloat(price),
        duration: parseInt(duration),
        businessId,
        message: 'Το πακέτο προστέθηκε επιτυχώς'
      });
    } catch (error) {
      console.error('Error adding package:', error);
      res.status(500).json({ message: 'Σφάλμα κατά την προσθήκη πακέτου' });
    }
  });

  /**
   * @route DELETE /api/packages/:packageId
   * @desc Διαγραφή πακέτου.
   * @access Private
   */
  router.delete('/:packageId', verifyToken, async (req, res) => {
    const { packageId } = req.params;
    const businessId = req.businessId;

    try {
      // ✅ Ελέγχει αν το πακέτο ανήκει στην επιχείρηση
      const [packageRows] = await pool.query(
        'SELECT id FROM packages WHERE id = ? AND business_id = ?',
        [packageId, businessId]
      );
      if (packageRows.length === 0) {
        return res.status(404).json({ message: 'Το πακέτο δεν βρέθηκε ή δεν έχετε εξουσιοδότηση' });
      }

      // 🗑 Διαγράφουμε τις αναθέσεις αυτού του πακέτου από όλους τους υπαλλήλους
      await pool.query('DELETE FROM employee_packages WHERE package_id = ?', [packageId]);

      // 🗑 Διαγράφουμε το πακέτο
      const [deleteResult] = await pool.query('DELETE FROM packages WHERE id = ?', [packageId]);

      if (deleteResult.affectedRows === 0) {
        return res.status(404).json({ message: 'Το πακέτο δεν βρέθηκε' });
      }

      res.status(200).json({ message: 'Το πακέτο διαγράφηκε επιτυχώς' });
    } catch (error) {
      console.error('Error deleting package:', error);
      res.status(500).json({ message: 'Σφάλμα κατά τη διαγραφή πακέτου' });
    }
  });

  /**
   * @route POST /api/packages/assign
   * @desc Ανάθεση ενός πακέτου σε πολλούς υπαλλήλους (χρησιμοποιείται για νέα πακέτα).
   * @access Private
   */
  router.post('/assign', verifyToken, async (req, res) => {
    const { packageId, employeeIds } = req.body;
    const businessId = req.businessId;

    if (!packageId || !employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
      return res.status(400).json({ message: 'Απαιτείται ID πακέτου και ένας πίνακας ID υπαλλήλων' });
    }

    try {
      // ✅ Ελέγχει αν το πακέτο ανήκει στην επιχείρηση
      const [packageRows] = await pool.query(
        'SELECT id FROM packages WHERE id = ? AND business_id = ?',
        [packageId, businessId]
      );
      if (packageRows.length === 0) {
        return res.status(404).json({ message: 'Το πακέτο δεν βρέθηκε ή δεν έχετε εξουσιοδότηση' });
      }

      // ✅ Ελέγχει αν όλοι οι υπάλληλοι ανήκουν στην επιχείρηση
      const [employeeRows] = await pool.query(
        'SELECT id FROM employees WHERE id IN (?) AND business_id = ?',
        [employeeIds, businessId]
      );
      if (employeeRows.length !== employeeIds.length) {
        return res.status(400).json({ message: 'Ένας ή περισσότεροι υπάλληλοι δεν βρέθηκαν ή δεν ανήκουν στην επιχείρησή σας' });
      }

      const values = employeeIds.map(empId => [empId, packageId]);

      // ➕ Εισάγουμε τις νέες αναθέσεις
      // Χρησιμοποιούμε INSERT IGNORE για να αποφύγουμε διπλότυπα αν η σχέση ήδη υπάρχει
      await pool.query(
        'INSERT IGNORE INTO employee_packages (employee_id, package_id) VALUES ?',
        [values]
      );

      res.status(200).json({ message: 'Το πακέτο ανατέθηκε επιτυχώς σε υπαλλήλους' });
    } catch (error) {
      console.error('Error assigning package:', error);
      res.status(500).json({ message: 'Σφάλμα κατά την ανάθεση πακέτου' });
    }
  });

  return router;
}
