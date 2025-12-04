const express = require('express');
const router = express.Router();
const Follow = require('../models/Follow'); // your Follow model
const User = require('../models/User');     // your User model

// GET followers of a user (who follows :id)
router.get('/users/:id/followers', async (req, res) => {
  try {
    const userId = req.params.id;

    // find follows where followee is the user -> those documents point to follower users
    const follows = await Follow.find({ followee: userId, status: 'accepted' })
      .populate({ path: 'follower', select: 'username name avatarUrl' }) // choose fields you need
      .sort({ createdAt: -1 }); // newest first (optional)

    // map to plain user list (filter out missing/removed accounts)
    const followers = follows
      .map(f => f.follower)
      .filter(Boolean)
      .map(u => ({
        id: u._id,
        username: u.username,
        name: u.name,
        avatarUrl: u.avatarUrl || null
      }));

    res.json(followers);
  } catch (err) {
    console.error('GET /users/:id/followers error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET users that :id is following
router.get('/users/:id/following', async (req, res) => {
  try {
    const userId = req.params.id;

    // find follows where follower is the user -> those documents point to followee users
    const follows = await Follow.find({ follower: userId, status: 'accepted' })
      .populate({ path: 'followee', select: 'username name avatarUrl' })
      .sort({ createdAt: -1 });

    const following = follows
      .map(f => f.followee)
      .filter(Boolean)
      .map(u => ({
        id: u._id,
        username: u.username,
        name: u.name,
        avatarUrl: u.avatarUrl || null
      }));

    res.json(following);
  } catch (err) {
    console.error('GET /users/:id/following error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
