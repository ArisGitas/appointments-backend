// src/middleware/verifyToken.js
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';

export default function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  console.log('Authorization Header:', authHeader);

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('Authorization header missing or malformed');
    return res.status(401).json({ message: 'Δεν υπάρχει token ή είναι κακογραμμένο' });
  }

  const token = authHeader.split(' ')[1]; // "Bearer token"

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      console.log('Token verification failed:', err.message);
      return res.status(403).json({ message: 'Μη έγκυρο token' });
    }

    if (!decoded.businessId) {
      console.log('Token decoded but businessId missing');
      return res.status(403).json({ message: 'Μη έγκυρο token: λείπει το businessId' });
    }

    req.businessId = decoded.businessId;
    console.log('Token verified, businessId:', decoded.businessId);
    next();
  });
}
