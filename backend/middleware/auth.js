// backend/middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET;

async function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing auth token' });
  }

  const token = auth.split(' ')[1];

  if (!JWT_SECRET) {
    console.error('JWT_SECRET is not set in environment');
    return res.status(500).json({ message: 'Server configuration error' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);

    // TEMP DEBUG — remove after testing
    console.log('🔥 AUTH MIDDLEWARE LOADED FROM FILE:', __filename);
    console.log('🔥 PAYLOAD SERVER SEES:', payload);

    // Accept common id claim names (sub, id, _id, userId)
    const userId = payload.userId || payload.id || payload._id || payload.sub;
    if (!userId) {
      console.warn('Auth failed - token payload missing user id:', payload);
      return res.status(401).json({ message: 'Invalid token payload' });
    }

    const user = await User.findById(userId).select('-passwordHash');
    if (!user) return res.status(401).json({ message: 'User not found' });

    req.user = user;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

module.exports = authMiddleware;
