// routes/accountRoutes.js
import express from 'express';
import bcrypt from 'bcrypt'; // Για την περίπτωση που θέλετε να αλλάξετε και κωδικό
import { protect } from '../middleware/auth.js'; // Εισάγουμε το middleware προστασίας

export default function (pool) {
  const router = express.Router();

  // --- 1. Ανάκτηση Προφίλ Επιχείρησης ---
  // GET /api/account/profile
  // Απαιτεί authentication (token)
  router.get('/profile', protect, async (req, res) => {
    const businessId = req.businessId; // Το businessId παρέχεται από το middleware

    try {
      const [business] = await pool.query(
        'SELECT id, name, email, phone, address, category FROM businesses WHERE id = ?',
        [businessId]
      );

      if (business.length === 0) {
        return res.status(404).json({ message: 'Δεν βρέθηκε λογαριασμός.' });
      }

      // Επιστροφή των στοιχείων της επιχείρησης (χωρίς τον κωδικό)
      res.status(200).json(business[0]);

    } catch (err) {
      console.error('Σφάλμα κατά την ανάκτηση προφίλ επιχείρησης:', err);
      res.status(500).json({ message: 'Σφάλμα στον server κατά την ανάκτηση του προφίλ.' });
    }
  });

  // --- 2. Ενημέρωση Προφίλ Επιχείρησης ---
  // PUT /api/account/profile
  // Απαιτεί authentication (token)
  router.put('/profile', protect, async (req, res) => {
    const businessId = req.businessId;
    const { name, email, phone, address, category, currentPassword, newPassword } = req.body;

    // Βασικός έλεγχος επικύρωσης
    if (!name || !email || !phone || !address || !category) {
      return res.status(400).json({ message: 'Όλα τα πεδία (εκτός κωδικού) είναι υποχρεωτικά.' });
    }

    try {
      // Προαιρετικός έλεγχος email αλλαγής (αν επιτρέπετε αλλαγή email)
      if (email !== req.userEmail) { // req.userEmail είναι το αρχικό email από το token
        const [existing] = await pool.query('SELECT id FROM businesses WHERE email = ? AND id != ?', [email, businessId]);
        if (existing.length > 0) {
          return res.status(400).json({ message: 'Το νέο email χρησιμοποιείται ήδη από άλλον λογαριασμό.' });
        }
      }

      let hashedPassword = null;
      if (newPassword) {
        // Αν ο χρήστης παρέχει νέο κωδικό, πρέπει να επαληθεύσουμε τον τρέχοντα
        if (!currentPassword) {
          return res.status(400).json({ message: 'Απαιτείται ο τρέχων κωδικός για αλλαγή κωδικού.' });
        }

        const [users] = await pool.query('SELECT password FROM businesses WHERE id = ?', [businessId]);
        if (users.length === 0) {
          return res.status(404).json({ message: 'Λογαριασμός δεν βρέθηκε για επαλήθευση κωδικού.' });
        }

        const business = users[0];
        const match = await bcrypt.compare(currentPassword, business.password);

        if (!match) {
          return res.status(401).json({ message: 'Ο τρέχων κωδικός είναι λανθασμένος.' });
        }

        hashedPassword = await bcrypt.hash(newPassword, 10);
      }

      let query = `UPDATE businesses SET name = ?, email = ?, phone = ?, address = ?, category = ?`;
      const params = [name, email, phone, address, category];

      if (hashedPassword) {
        query += `, password = ?`;
        params.push(hashedPassword);
      }

      query += ` WHERE id = ?`;
      params.push(businessId);

      await pool.query(query, params);

      res.status(200).json({ message: 'Το προφίλ ενημερώθηκε επιτυχώς.' });

    } catch (err) {
      console.error('Σφάλμα κατά την ενημέρωση προφίλ επιχείρησης:', err);
      res.status(500).json({ message: 'Σφάλμα στον server κατά την ενημέρωση του προφίλ.' });
    }
  });

  // --- 3. Διαγραφή Λογαριασμού Επιχείρησης ---
  // DELETE /api/account/delete
  // Απαιτεί authentication (token)
  // ΠΡΟΣΟΧΗ: Αυτό θα διαγράψει ΟΛΑ τα σχετικά δεδομένα. Χρειάζεστε CASCADE DELETE στα foreign keys
  // ή να διαγράψετε χειροκίνητα τους υπαλλήλους, ωράρια, υπηρεσίες, ραντεβού κ.λπ.
  router.delete('/delete', protect, async (req, res) => {
    const businessId = req.businessId;

    try {
      // Ξεκινάμε μια συναλλαγή (transaction) για να διασφαλίσουμε την ατομικότητα
      await pool.query('START TRANSACTION');

      // Προαιρετικά: Διαγραφή σχετικών δεδομένων χειροκίνητα
      // Βεβαιωθείτε ότι η σειρά διαγραφής είναι σωστή λόγω foreign keys
      await pool.query('DELETE FROM employee_schedule_slots WHERE employee_id IN (SELECT id FROM employees WHERE business_id = ?)', [businessId]);
      await pool.query('DELETE FROM employees WHERE business_id = ?', [businessId]);
      await pool.query('DELETE FROM services WHERE business_id = ?', [businessId]);
      // Προσθέστε εδώ διαγραφές για ραντεβού ή άλλους πίνακες που σχετίζονται με το business_id
      // await pool.query('DELETE FROM appointments WHERE business_id = ?', [businessId]);

      // Τέλος, διαγραφή της ίδιας της επιχείρησης
      await pool.query('DELETE FROM businesses WHERE id = ?', [businessId]);

      await pool.query('COMMIT'); // Ολοκλήρωση της συναλλαγής

      res.status(200).json({ message: 'Ο λογαριασμός διαγράφηκε επιτυχώς.' });

    } catch (err) {
      await pool.query('ROLLBACK'); // Αναίρεση αν κάτι πάει στραβά
      console.error('Σφάλμα κατά τη διαγραφή λογαριασμού επιχείρησης:', err);
      res.status(500).json({ message: 'Σφάλμα στον server κατά τη διαγραφή του λογαριασμού.' });
    }
  });

  return router;
}