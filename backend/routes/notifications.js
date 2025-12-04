// notifications route (requires auth middleware)
const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const auth = require('../middleware/auth'); // adapt to your auth

// Create notification
router.post('/', auth, async (req, res) => {
  try {
    const { user, actor, verb, targetType, targetId, read, meta } = req.body;
    // ensure required fields
    if (!user || !actor) return res.status(400).json({ message: 'user & actor required' });

    const n = await Notification.create({
      user, actor, verb, targetType, targetId, read: !!read, meta
    });

    // Optionally emit via socket.io to user (if you have socket server)
    if (req.app && req.app.get('io')) {
      const io = req.app.get('io');
      io.to(String(user)).emit('notification_created', n);
    }

    res.status(201).json({ success: true, notification: n });
  } catch (err) {
    console.error('create notif error', err);
    res.status(500).json({ message: 'server error' });
  }
});

// Unread count for current user - FIXED
router.get('/unread/count', auth, async (req, res) => {
  try {
    // ✅ FIXED: Use req.user._id instead of req.user.id
    const userId = req.user._id || req.user.id;
    
    console.log('📊 Getting unread notification count for user:', userId);
    
    if (!userId) {
      console.error('❌ No user ID found in request');
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const count = await Notification.countDocuments({ user: userId, read: false });
    
    console.log('✅ Unread notifications:', count);
    
    res.json({ count });
  } catch (err) {
    console.error('❌ Unread count error:', err);
    res.status(500).json({ message: 'server error', details: err.message });
  }
});

// Mark a notification read - FIXED
router.put('/:id/read', auth, async (req, res) => {
  try {
    // ✅ FIXED: Use req.user._id instead of req.user.id
    const userId = req.user._id || req.user.id;
    
    console.log('✅ Marking notification as read:', req.params.id, 'for user:', userId);
    
    const n = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: userId }, 
      { read: true }, 
      { new: true }
    );
    
    if (!n) {
      console.log('❌ Notification not found or not owned by user');
      return res.status(404).json({ message: 'not found' });
    }
    
    console.log('✅ Notification marked as read');
    
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Mark read error:', err);
    res.status(500).json({ message: 'server error', details: err.message });
  }
});

module.exports = router;