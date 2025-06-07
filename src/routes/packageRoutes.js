import express from 'express';
import verifyToken from '../middleware/verifyToken.js';

export default function (pool) {
  const router = express.Router();

  /**
   * @route GET /api/services
   * @desc Ανάκτηση όλων των υπηρεσιών (πακέτων) για την αυθεντικοποιημένη επιχείρηση,
   * συμπεριλαμβανομένων των ανατεθειμένων υπαλλήλων.
   * @access Private
   */
  router.get('/', verifyToken, async (req, res) => {
    const businessId = req.businessId;

    try {
      // 1. Fetch all services for the business
      const [servicesRows] = await pool.query(
        'SELECT id, title, price, duration FROM services WHERE business_id = ?',
        [businessId]
      );

      // 2. Fetch all employee-service assignments for services belonging to this business
      const serviceIds = servicesRows.map(s => s.id);
      let assignmentsRows = [];
      if (serviceIds.length > 0) {
        [assignmentsRows] = await pool.query(
          'SELECT employee_id, service_id FROM employee_services WHERE service_id IN (?)',
          [serviceIds]
        );
      }

      // 3. Map assigned employee IDs to each service
      const servicesWithAssignments = servicesRows.map(service => {
        const assignedEmployeeIds = assignmentsRows
          .filter(assignment => assignment.service_id === service.id)
          .map(assignment => assignment.employee_id); // Returns an array of employee IDs

        return {
          ...service,
          assigned_employee_ids: assignedEmployeeIds, // Add the new field
        };
      });

      res.status(200).json(servicesWithAssignments);
    } catch (error) {
      console.error('Error fetching services with assignments:', error);
      res.status(500).json({ message: 'Σφάλμα κατά την ανάκτηση υπηρεσιών με αναθέσεις' });
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
        'INSERT INTO services (title, price, duration, business_id) VALUES (?, ?, ?, ?)',
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
  router.delete('/:serviceId', verifyToken, async (req, res) => {
    const { serviceId } = req.params;
    const businessId = req.businessId;

    try {
      const [serviceRows] = await pool.query(
        'SELECT id FROM services WHERE id = ? AND business_id = ?',
        [serviceId, businessId]
      );
      if (serviceRows.length === 0) {
        return res.status(404).json({ message: 'Η υπηρεσία δεν βρέθηκε ή δεν έχετε εξουσιοδότηση' });
      }

      // Διαγράφουμε τις αναθέσεις αυτής της υπηρεσίας από όλους τους υπαλλήλους
      await pool.query('DELETE FROM employee_services WHERE service_id = ?', [serviceId]);

      // Διαγράφουμε την υπηρεσία
      const [deleteResult] = await pool.query('DELETE FROM services WHERE id = ?', [serviceId]);

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
   * @desc Ανάθεση μιας υπηρεσίας (πακέτου) σε πολλούς υπαλλήλους.
   * Χρησιμοποιείται τόσο για αρχική ανάθεση νέας υπηρεσίας όσο και για ενημέρωση αναθέσεων.
   * Διαγράφει τις υπάρχουσες αναθέσεις για την υπηρεσία και εισάγει τις νέες.
   * @access Private
   */
  router.post('/assign', verifyToken, async (req, res) => {
    const { packageId, employeeIds } = req.body; // packageId is the serviceId
    const businessId = req.businessId;

    // --- Added console logs for debugging ---
    console.log('Assign Service Request received:');
    console.log('  serviceId (packageId):', packageId);
    console.log('  employeeIds to assign:', employeeIds);
    console.log('  businessId from token:', businessId);
    // --- End console logs ---

    if (!packageId || !employeeIds || !Array.isArray(employeeIds)) {
      console.log('Validation failed: Missing serviceId or employeeIds array.');
      return res.status(400).json({ message: 'Απαιτείται ID υπηρεσίας και ένας πίνακας ID υπαλλήλων' });
    }

    try {
      // 1. Verify service belongs to the business
      const [serviceRows] = await pool.query(
        'SELECT id FROM services WHERE id = ? AND business_id = ?',
        [packageId, businessId]
      );
      if (serviceRows.length === 0) {
        console.log('Validation failed: Service not found or not authorized.');
        return res.status(404).json({ message: 'Η υπηρεσία δεν βρέθηκε ή δεν έχετε εξουσιοδότηση' });
      }

      // 2. Verify all employee IDs belong to the business (if any are provided)
      if (employeeIds.length > 0) {
        const [employeeRows] = await pool.query(
          'SELECT id FROM employees WHERE id IN (?) AND business_id = ?',
          [employeeIds, businessId]
        );
        if (employeeRows.length !== employeeIds.length) {
          console.log('Validation failed: Some employees not found or not authorized. Found:', employeeRows.length, 'Expected:', employeeIds.length);
          return res.status(400).json({ message: 'Ένας ή περισσότεροι υπάλληλοι δεν βρέθηκαν ή δεν ανήκουν στην επιχείρησή σας' });
        }
      }

      // 3. Delete existing assignments for this service
      console.log('Deleting existing assignments for service_id:', packageId);
      await pool.query('DELETE FROM employee_services WHERE service_id = ?', [packageId]);

      // 4. Insert new assignments (if employeeIds array is not empty)
      if (employeeIds.length > 0) {
        const values = employeeIds.map(empId => [empId, packageId]);
        console.log('Attempting to insert into employee_services with new values:', values);
        const [insertResult] = await pool.query( // Capture the result of the insert
          'INSERT IGNORE INTO employee_services (employee_id, service_id) VALUES ?',
          [values]
        );
        console.log('Insert result for employee_services:', insertResult); // Log insert result
      } else {
        console.log('No employee IDs provided, no new assignments to insert.');
      }

      res.status(200).json({ message: 'Οι αναθέσεις υπηρεσίας ενημερώθηκαν επιτυχώς' });
    } catch (error) {
      console.error('Error assigning service:', error); // This is the crucial log
      res.status(500).json({ message: 'Σφάλμα κατά την ανάθεση υπηρεσίας' });
    }
  });

  /**
   * @route PUT /api/services/:serviceId
   * @desc Ενημέρωση υπάρχουσας υπηρεσίας.
   * @access Private
   */
  router.put('/:serviceId', verifyToken, async (req, res) => {
    const { serviceId } = req.params;
    const { title, price, duration } = req.body;
    const businessId = req.businessId; // Get businessId from token

    if (!title || !price || !duration) {
      return res.status(400).json({ message: 'Παρακαλώ συμπληρώστε όλα τα πεδία της υπηρεσίας' });
    }
    if (isNaN(price) || parseFloat(price) <= 0 || isNaN(duration) || parseInt(duration) <= 0) {
      return res.status(400).json({ message: 'Η τιμή και η διάρκεια πρέπει να είναι θετικοί αριθμοί.' });
    }

    try {
      // Ελέγχει αν η υπηρεσία ανήκει στην επιχείρηση και υπάρχει
      const [serviceRows] = await pool.query(
        'SELECT id FROM services WHERE id = ? AND business_id = ?',
        [serviceId, businessId]
      );
      if (serviceRows.length === 0) {
        return res.status(404).json({ message: 'Η υπηρεσία δεν βρέθηκε ή δεν έχετε εξουσιοδότηση' });
      }

      // Ενημέρωση της υπηρεσίας
      const [result] = await pool.query(
        'UPDATE services SET title = ?, price = ?, duration = ? WHERE id = ? AND business_id = ?',
        [title, parseFloat(price), parseInt(duration), serviceId, businessId]
      );

      if (result.affectedRows === 0) {
        // This case should ideally be caught by serviceRows check, but good for robustness
        return res.status(404).json({ message: 'Η υπηρεσία δεν βρέθηκε για ενημέρωση' });
      }

      res.status(200).json({ message: 'Η υπηρεσία ενημερώθηκε επιτυχώς' });
    } catch (error) {
      console.error('Error updating service:', error);
      res.status(500).json({ message: 'Σφάλμα κατά την ενημέρωση υπηρεσίας' });
    }
  });


  return router;
}
