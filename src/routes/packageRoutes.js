import express from 'express';
import verifyToken from '../middleware/verifyToken.js';

export default function (pool) {
  const router = express.Router();

  /**
   * @route GET /api/services
   * @desc Ανάκτηση όλων των υπηρεσιών (πακέτων) για την αυθεντικοποιημένη επιχείρηση.
   * @access Private
   */
  router.get('/', verifyToken, async (req, res) => {
    const businessId = req.businessId;

    try {
      const [rows] = await pool.query(
        'SELECT id, title, price, duration FROM services WHERE business_id = ?', // Changed to 'services'
        [businessId]
      );
      res.status(200).json(rows);
    } catch (error) {
      console.error('Error fetching services:', error);
      res.status(500).json({ message: 'Σφάλμα κατά την ανάκτηση υπηρεσιών' });
    }
  });

  /**
   * @route POST /api/services/add
   * @desc Προσθήκη νέας υπηρεσίας (πακέτου).
   * @access Private
   */
  router.post('/add', verifyToken, async (req, res) => {
    const { title, price, duration } = req.body;
    const businessId = req.businessId;

    if (!title || !price || !duration) {
      return res.status(400).json({ message: 'Παρακαλώ συμπληρώστε όλα τα πεδία της υπηρεσίας' });
    }
    if (isNaN(price) || parseFloat(price) <= 0 || isNaN(duration) || parseInt(duration) <= 0) {
      return res.status(400).json({ message: 'Η τιμή και η διάρκεια πρέπει να είναι θετικοί αριθμοί' });
    }

    try {
      const [result] = await pool.query(
        'INSERT INTO services (title, price, duration, business_id) VALUES (?, ?, ?, ?)', // Changed to 'services'
        [title, parseFloat(price), parseInt(duration), businessId]
      );

      res.status(201).json({
        id: result.insertId,
        title,
        price: parseFloat(price),
        duration: parseInt(duration),
        businessId,
        message: 'Η υπηρεσία προστέθηκε επιτυχώς'
      });
    } catch (error) {
      console.error('Error adding service:', error);
      res.status(500).json({ message: 'Σφάλμα κατά την προσθήκη υπηρεσίας' });
    }
  });

  /**
   * @route DELETE /api/services/:serviceId
   * @desc Διαγραφή υπηρεσίας (πακέτου).
   * @access Private
   */
  router.delete('/:serviceId', verifyToken, async (req, res) => { // Changed param to serviceId
    const { serviceId } = req.params; // Changed to serviceId
    const businessId = req.businessId;

    try {
      const [serviceRows] = await pool.query(
        'SELECT id FROM services WHERE id = ? AND business_id = ?', // Changed to 'services'
        [serviceId, businessId]
      );
      if (serviceRows.length === 0) {
        return res.status(404).json({ message: 'Η υπηρεσία δεν βρέθηκε ή δεν έχετε εξουσιοδότηση' });
      }

      // Διαγράφουμε τις αναθέσεις αυτής της υπηρεσίας από όλους τους υπαλλήλους
      await pool.query('DELETE FROM employee_packages WHERE package_id = ?', [serviceId]); // 'package_id' in join table is fine

      // Διαγράφουμε την υπηρεσία
      const [deleteResult] = await pool.query('DELETE FROM services WHERE id = ?', [serviceId]); // Changed to 'services'

      if (deleteResult.affectedRows === 0) {
        return res.status(404).json({ message: 'Η υπηρεσία δεν βρέθηκε' });
      }

      res.status(200).json({ message: 'Η υπηρεσία διαγράφηκε επιτυχώς' });
    } catch (error) {
      console.error('Error deleting service:', error);
      res.status(500).json({ message: 'Σφάλμα κατά τη διαγραφή υπηρεσίας' });
    }
  });

  /**
   * @route POST /api/services/assign
   * @desc Ανάθεση μιας υπηρεσίας (πακέτου) σε πολλούς υπαλλήλους (χρησιμοποιείται για νέες υπηρεσίες).
   * @access Private
   */
  router.post('/assign', verifyToken, async (req, res) => {
    const { packageId, employeeIds } = req.body; // packageId still used here from frontend
    const businessId = req.businessId;

    if (!packageId || !employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
      return res.status(400).json({ message: 'Απαιτείται ID υπηρεσίας και ένας πίνακας ID υπαλλήλων' });
    }

    try {
      const [serviceRows] = await pool.query(
        'SELECT id FROM services WHERE id = ? AND business_id = ?', // Changed to 'services'
        [packageId, businessId]
      );
      if (serviceRows.length === 0) {
        return res.status(404).json({ message: 'Η υπηρεσία δεν βρέθηκε ή δεν έχετε εξουσιοδότηση' });
      }

      const [employeeRows] = await pool.query(
        'SELECT id FROM employees WHERE id IN (?) AND business_id = ?',
        [employeeIds, businessId]
      );
      if (employeeRows.length !== employeeIds.length) {
        return res.status(400).json({ message: 'Ένας ή περισσότεροι υπάλληλοι δεν βρέθηκαν ή δεν ανήκουν στην επιχείρησή σας' });
      }

      const values = employeeIds.map(empId => [empId, packageId]);

      await pool.query(
        'INSERT IGNORE INTO employee_packages (employee_id, package_id) VALUES ?',
        [values]
      );

      res.status(200).json({ message: 'Η υπηρεσία ανατέθηκε επιτυχώς σε υπαλλήλους' });
    } catch (error) {
      console.error('Error assigning service:', error);
      res.status(500).json({ message: 'Σφάλμα κατά την ανάθεση υπηρεσίας' });
    }
  });

  return router;
}
