// middleware/auth.js
import jwt from 'jsonwebtoken';

// Βεβαιωθείτε ότι το JWT_SECRET είναι διαθέσιμο μέσω μεταβλητής περιβάλλοντος.
// Αυτό ΠΡΕΠΕΙ να είναι το ίδιο secret που χρησιμοποιείται για την υπογραφή των tokens
// στην εγγραφή και τη σύνδεση.
const JWT_SECRET = process.env.JWT_SECRET || 'SUPER_DIP_SECRET_KEY_PLEASE_CHANGE_ME_IN_PRODUCTION';

const verifyToken = (req, res, next) => {
  let token;

  // Ελέγχουμε αν υπάρχει το Authorization header και ξεκινάει με 'Bearer'
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Παίρνουμε το token από το header (π.χ. "Bearer <token_string>")
      token = req.headers.authorization.split(' ')[1];

      // Επαληθεύουμε το token
      const decoded = jwt.verify(token, JWT_SECRET);

      // Εδώ υποθέτουμε ότι το payload του token περιέχει ένα 'businessId'.
      // Αυτό το businessId είναι κρίσιμο για να γνωρίζουμε ποιος χρήστης κάνει το request.
      req.businessId = decoded.businessId;
      req.userEmail = decoded.email; // Προαιρετικά, αν θέλετε να έχετε πρόσβαση και στο email

      next(); // Προχωράμε στο επόμενο middleware ή στον handler της route
    } catch (error) {
      // Διαχείριση διαφορετικών τύπων σφαλμάτων JWT
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Μη εξουσιοδοτημένη πρόσβαση, το token έχει λήξει. Παρακαλώ συνδεθείτε ξανά.' });
      }
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({ message: 'Μη εξουσιοδοτημένη πρόσβαση, μη έγκυρο token.' });
      }
      console.error('Σφάλμα επαλήθευσης token:', error.message);
      return res.status(401).json({ message: 'Μη εξουσιοδοτημένη πρόσβαση, σφάλμα token.' });
    }
  }

  // Αν δεν βρέθηκε καθόλου token στο header
  if (!token) {
    return res.status(401).json({ message: 'Μη εξουσιοδοτημένη πρόσβαση, δεν βρέθηκε token.' });
  }
};

export { verifyToken  }; // Εξάγουμε τη συνάρτηση ως ονομαστικό export