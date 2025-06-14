// src/middleware/verifyToken.js
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';

export default function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer token"

  if (!token) return res.status(401).json({ message: 'Δεν υπάρχει token' });

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ message: 'Μη έγκυρο token' });

    req.businessId = decoded.businessId;
    next();
  });
}
