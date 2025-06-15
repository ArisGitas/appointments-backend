// routes/businessRoutes.js
// Αυτό το αρχείο χειρίζεται ΟΛΕΣ τις λειτουργίες για τον πόρο 'business':
// - Εγγραφή Επιχείρησης (POST /register)
// - Σύνδεση Επιχείρησης (POST /login)
// - Ανάκτηση Προφίλ Επιχείρησης (GET /profile)
// - Ενημέρωση Προφίλ Επιχείρησης (PUT /profile, συμπεριλαμβανομένης της αλλαγής κωδικού)
// - Διαγραφή Λογαριασμού Επιχείρησης (DELETE /delete)
// - Αίτημα Ανάκτησης Κωδικού (POST /forgot-password)
// - Επαναφορά Κωδικού (POST /reset-password)

import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto'; // Για τη δημιουργία τυχαίων tokens
import verifyToken from '../middleware/verifyToken.js'; // Το middleware για την επαλήθευση του JWT

const JWT_SECRET = process.env.JWT_SECRET || 'SUPER_DIP_SECRET_KEY_PLEASE_CHANGE_ME_IN_PRODUCTION';

export default function (pool) {
  const router = express.Router();

  // --- Εγγραφή Επιχείρησης (ίδιο με πριν) ---
  // POST /api/business/register
  router.post('/register', async (req, res) => {
    const { name, email, password, phone, address, category, employees, services } = req.body;

    if (!name || !email || !password || !phone || !address || !category) {
      return res.status(400).json({ message: 'Όλα τα πεδία είναι υποχρεωτικά για την εγγραφή.' });
    }

    try {
      const [existing] = await pool.query('SELECT id FROM businesses WHERE email = ?', [email]);
      if (existing.length > 0) {
        return res.status(409).json({ message: 'Αυτό το email χρησιμοποιείται ήδη.' }); // 409 Conflict
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const [result] = await pool.query(
        `INSERT INTO businesses (name, email, password, phone, address, category) VALUES (?, ?, ?, ?, ?, ?)`,
        [name, email, hashedPassword, phone, address, category]
      );
      const businessId = result.insertId;

      // Εισαγωγή αρχικών υπαλλήλων και των ωραρίων τους
      if (Array.isArray(employees) && employees.length > 0) {
        for (const emp of employees) {
          const { name: empName, schedule } = emp;
          if (!empName) continue;

          const [empResult] = await pool.query(`INSERT INTO employees (business_id, name) VALUES (?, ?)`, [businessId, empName]);
          const employeeId = empResult.insertId;

          if (schedule && typeof schedule === 'object') {
            for (const day in schedule) {
              const slots = schedule[day];
              if (Array.isArray(slots)) {
                for (const slot of slots) {
                  const from = slot.from || null;
                  const to = slot.to || null;
                  if (from && to) { // Εισαγωγή μόνο έγκυρων χρονοθυρίδων
                    await pool.query(
                      `INSERT INTO employee_schedule_slots (employee_id, day_of_week, from_hour, to_hour) VALUES (?, ?, ?, ?)`,
                      [employeeId, day, from, to]
                    );
                  }
                }
              }
            }
          }
        }
      }

      // Εισαγωγή αρχικών υπηρεσιών
      if (Array.isArray(services) && services.length > 0) {
        for (const svc of services) {
          const { title, price, duration } = svc;
          if (!title || !price || !duration) continue;

          await pool.query(
            `INSERT INTO services (business_id, title, price, duration) VALUES (?, ?, ?, ?)`,
            [businessId, title, price, duration]
          );
        }
      }

      const token = jwt.sign({ businessId: businessId, email: email }, JWT_SECRET, { expiresIn: '2h' });

      res.status(201).json({ message: 'Η επιχείρηση καταχωρήθηκε επιτυχώς!', token, businessId });

    } catch (err) {
      console.error('Σφάλμα κατά την εγγραφή επιχείρησης:', err);
      res.status(500).json({ message: 'Σφάλμα στον server κατά την εγγραφή.' });
    }
  });

  // --- Σύνδεση Επιχείρησης (ίδιο με πριν) ---
  // POST /api/business/login
  router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
      const [users] = await pool.query('SELECT id, email, password FROM businesses WHERE email = ?', [email]);

      if (users.length === 0) {
        return res.status(400).json({ message: 'Λανθασμένο email ή κωδικός.' });
      }

      const business = users[0];
      const match = await bcrypt.compare(password, business.password);

      if (!match) {
        return res.status(400).json({ message: 'Λανθασμένο email ή κωδικός.' });
      }

      const token = jwt.sign({ businessId: business.id, email: business.email }, JWT_SECRET, {
        expiresIn: '2h', // Το token λήγει σε 2 ώρες
      });

      res.json({ message: 'Επιτυχής είσοδος!', token, businessId: business.id });

    } catch (err) {
      console.error('Σφάλμα κατά τη σύνδεση:', err);
      res.status(500).json({ message: 'Σφάλμα στον server κατά τη σύνδεση.' });
    }
  });

  // --- Ανάκτηση Προφίλ Επιχείρησης (ίδιο με πριν) ---
  // GET /api/business/profile
  router.get('/profile', verifyToken, async (req, res) => {
    const businessId = req.businessId;

    try {
      const [business] = await pool.query(
        'SELECT id, name, email, phone, address, category FROM businesses WHERE id = ?',
        [businessId]
      );

      if (business.length === 0) {
        return res.status(404).json({ message: 'Το προφίλ της επιχείρησης δεν βρέθηκε.' });
      }

      res.status(200).json(business[0]);

    } catch (err) {
      console.error('Σφάλμα κατά την ανάκτηση προφίλ επιχείρησης:', err);
      res.status(500).json({ message: 'Σφάλμα στον server κατά την ανάκτηση του προφίλ.' });
    }
  });

  // --- Ενημέρωση Προφίλ Επιχείρησης (ίδιο με πριν) ---
  // PUT /api/business/profile
  router.put('/profile', verifyToken, async (req, res) => {
    const businessId = req.businessId;
    const { name, email, phone, address, category, currentPassword, newPassword } = req.body;

    if (!name || !email || !phone || !address || !category) {
      return res.status(400).json({ message: 'Όλα τα βασικά πεδία (όνομα, email, τηλέφωνο, διεύθυνση, κατηγορία) είναι υποχρεωτικά.' });
    }

    try {
      const [currentBusinessData] = await pool.query('SELECT email, password FROM businesses WHERE id = ?', [businessId]);
      if (currentBusinessData.length === 0) {
          return res.status(404).json({ message: 'Επιχείρηση δεν βρέθηκε.' });
      }
      const currentEmail = currentBusinessData[0].email;
      const storedPassword = currentBusinessData[0].password;


      if (email !== currentEmail) {
        const [existing] = await pool.query('SELECT id FROM businesses WHERE email = ? AND id != ?', [email, businessId]);
        if (existing.length > 0) {
          return res.status(409).json({ message: 'Το νέο email χρησιμοποιείται ήδη από άλλον λογαριασμό.' });
        }
      }

      let hashedPassword = storedPassword;
      if (newPassword) {
        if (!currentPassword) {
          return res.status(400).json({ message: 'Ο τρέχων κωδικός απαιτείται για την αλλαγή κωδικού.' });
        }
        const match = await bcrypt.compare(currentPassword, storedPassword);
        if (!match) {
          return res.status(401).json({ message: 'Ο τρέχων κωδικός είναι λανθασμένος.' });
        }
        hashedPassword = await bcrypt.hash(newPassword, 10);
      }

      await pool.query(
        `UPDATE businesses SET name = ?, email = ?, password = ?, phone = ?, address = ?, category = ? WHERE id = ?`,
        [name, email, hashedPassword, phone, address, category, businessId]
      );

      res.status(200).json({ message: 'Το προφίλ της επιχείρησης ενημερώθηκε επιτυχώς.' });

    } catch (err) {
      console.error('Σφάλμα κατά την ενημέρωση προφίλ επιχείρησης:', err);
      res.status(500).json({ message: 'Σφάλμα στον server κατά την ενημέρωση του προφίλ.' });
    }
  });

  // --- Διαγραφή Λογαριασμού Επιχείρησης (ίδιο με πριν) ---
  // DELETE /api/business/delete
  router.delete('/delete', verifyToken, async (req, res) => {
    const businessId = req.businessId;

    try {
      await pool.query('START TRANSACTION');

      await pool.query(
        'DELETE FROM employee_schedule_slots WHERE employee_id IN (SELECT id FROM employees WHERE business_id = ?)',
        [businessId]
      );
      await pool.query('DELETE FROM employees WHERE business_id = ?', [businessId]);
      await pool.query('DELETE FROM services WHERE business_id = ?', [businessId]);
      // ΣΗΜΑΝΤΙΚΟ: Προσθέστε εδώ διαγραφές για ραντεβού ή άλλους πίνακες
      // που σχετίζονται με το business_id
      // await pool.query('DELETE FROM appointments WHERE business_id = ?', [businessId]);

      const [deleteBusinessResult] = await pool.query('DELETE FROM businesses WHERE id = ?', [businessId]);

      if (deleteBusinessResult.affectedRows === 0) {
        await pool.query('ROLLBACK');
        return res.status(404).json({ message: 'Ο λογαριασμός επιχείρησης δεν βρέθηκε για διαγραφή.' });
      }

      await pool.query('COMMIT');

      res.status(200).json({ message: 'Ο λογαριασμός επιχείρησης διαγράφηκε επιτυχώς.' });

    } catch (err) {
      await pool.query('ROLLBACK');
      console.error('Σφάλμα κατά τη διαγραφή λογαριασμού επιχείρησης:', err);
      res.status(500).json({ message: 'Σφάλμα στον server κατά τη διαγραφή του λογαριασμού.' });
    }
  });

  // --- ΝΕΟ: Αίτημα Ανάκτησης Κωδικού ---
  // POST /api/business/forgot-password
  router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Το email είναι υποχρεωτικό.' });
    }

    try {
      const [businesses] = await pool.query('SELECT id FROM businesses WHERE email = ?', [email]);

      if (businesses.length === 0) {
        // Επιστρέφουμε πάντα ένα γενικό μήνυμα για λόγους ασφαλείας,
        // ώστε να μην αποκαλύπτουμε αν το email υπάρχει ή όχι.
        return res.status(200).json({ message: 'Εάν το email υπάρχει, οδηγίες επαναφοράς κωδικού έχουν σταλεί.' });
      }

      const businessId = businesses[0].id;
      const resetToken = crypto.randomBytes(32).toString('hex'); // Δημιουργία τυχαίου token
      const resetTokenExpiry = new Date(Date.now() + 3600000); // Λήξη σε 1 ώρα (3600000 ms)

      // Αποθήκευση του token και της ημερομηνίας λήξης στη βάση δεδομένων
      await pool.query(
        `UPDATE businesses SET reset_token = ?, reset_token_expiry = ? WHERE id = ?`,
        [resetToken, resetTokenExpiry, businessId]
      );

      // --- Προσομοίωση Αποστολής Email ---
      // Σε πραγματική εφαρμογή, εδώ θα στέλνατε ένα email στον χρήστη με έναν σύνδεσμο
      // που θα περιέχει το resetToken.
      const resetLink = `YOUR_FRONTEND_RESET_PASSWORD_URL?token=${resetToken}`;
      console.log(`Password Reset Link for ${email}: ${resetLink}`);
      // ------------------------------------

      res.status(200).json({ message: 'Εάν το email υπάρχει, οδηγίες επαναφοράς κωδικού έχουν σταλεί.' });

    } catch (err) {
      console.error('Σφάλμα κατά την ανάκτηση κωδικού:', err);
      res.status(500).json({ message: 'Σφάλμα στον server κατά την ανάκτηση κωδικού.' });
    }
  });

  // --- ΝΕΟ: Επαναφορά Κωδικού ---
  // POST /api/business/reset-password
  router.post('/reset-password', async (req, res) => {
    const { resetToken, newPassword, confirmNewPassword } = req.body;

    if (!resetToken || !newPassword || !confirmNewPassword) {
      return res.status(400).json({ message: 'Λείπουν πεδία (token, νέος κωδικός, επιβεβαίωση).' });
    }

    if (newPassword !== confirmNewPassword) {
      return res.status(400).json({ message: 'Ο νέος κωδικός και η επιβεβαίωση δεν ταιριάζουν.' });
    }

    // Προσθέστε ελέγχους για πολυπλοκότητα κωδικού (π.χ. μήκος, χαρακτήρες)
    if (newPassword.length < 6) { // Παράδειγμα: ελάχιστο μήκος 6
      return res.status(400).json({ message: 'Ο νέος κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες.' });
    }

    try {
      const [businesses] = await pool.query(
        `SELECT id, reset_token_expiry FROM businesses WHERE reset_token = ?`,
        [resetToken]
      );

      if (businesses.length === 0 || new Date() > new Date(businesses[0].reset_token_expiry)) {
        return res.status(400).json({ message: 'Μη έγκυρο ή ληγμένο token επαναφοράς κωδικού.' });
      }

      const businessId = businesses[0].id;
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Ενημέρωση κωδικού και ακύρωση του token
      await pool.query(
        `UPDATE businesses SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?`,
        [hashedPassword, businessId]
      );

      res.status(200).json({ message: 'Ο κωδικός ενημερώθηκε επιτυχώς!' });

    } catch (err) {
      console.error('Σφάλμα κατά την επαναφορά κωδικού:', err);
      res.status(500).json({ message: 'Σφάλμα στον server κατά την επαναφορά κωδικού.' });
    }
  });

  return router;
}
