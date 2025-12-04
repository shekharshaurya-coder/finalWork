// routes/users.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const { mongoose } = require('../db');

// GET /api/users/me
router.get('/me', auth, async (req, res) => {
  // req.user set by middleware, already populated without password
  res.json(req.user);
});

// PUT /api/users/me
router.put('/me', auth, async (req, res) => {
  try {
    const updates = {};
    if (req.body.bio !== undefined) updates.bio = req.body.bio;
    if (req.body.avatar_url !== undefined) updates.avatar_url = req.body.avatar_url;
    if (req.body.username !== undefined) updates.username = req.body.username;

    if (Object.keys(updates).length === 0) return res.status(400).json({ message: 'No updates provided' });

    await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
    const updated = await User.findById(req.user._id).select('-password');
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
