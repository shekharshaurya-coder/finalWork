// routes/logDemo.js
const express = require('express');
const router = express.Router();
const logger = require('../services/logger');

// fake auth middleware for dummy routes
function fakeAuth(req, res, next) {
  // in real app this comes from JWT/session
  req.user = { _id: '123', username: 'shekyyy' };
  next();
}

router.use(fakeAuth);

/* ========== AUTH ========== */

// LOGIN
router.post('/login', async (req, res) => {
  const user = { _id: 'u1', username: 'admin' }; // dummy

  await logger.logFromRequest(req, {
    eventType: 'LOGIN',
    description: 'User logged in',
    userId: user._id,
    username: user.username,
  });

  res.json({ ok: true });
});

// LOGOUT
router.post('/logout', async (req, res) => {
  await logger.logFromRequest(req, {
    eventType: 'LOGOUT',
    description: 'User logged out',
  });

  res.json({ ok: true });
});

// SIGNUP
router.post('/signup', async (req, res) => {
  const user = { _id: 'u2', username: 'raksh', email: 'raksh@test.com' };

  await logger.logFromRequest(req, {
    eventType: 'SIGNUP',
    description: 'User signed up',
    userId: user._id,
    username: user.username,
    metadata: { email: user.email },
    priority: 'medium',
  });

  res.json({ ok: true });
});

// FAILED LOGIN
router.post('/failed-login', async (req, res) => {
  const { username } = req.body;

  await logger.logFromRequest(req, {
    eventType: 'FAILED_LOGIN',
    description: 'Failed login attempt',
    userId: null,
    username: username || 'unknown',
    metadata: { reason: 'Invalid credentials' },
    priority: 'medium',
  });

  res.json({ ok: true });
});


/* ========== POSTS ========== */

// CREATE POST
router.post('/posts', async (req, res) => {
  const postId = 'post123';

  await logger.logFromRequest(req, {
    eventType: 'POST_CREATED',
    description: 'User created a post',
    metadata: { postId },
  });

  res.json({ ok: true });
});

// DELETE POST
router.delete('/posts/:id', async (req, res) => {
  const postId = req.params.id;

  await logger.logFromRequest(req, {
    eventType: 'POST_DELETED',
    description: 'User deleted a post',
    metadata: { postId },
  });

  res.json({ ok: true });
});


/* ========== COMMENTS ========== */

// ADD COMMENT
router.post('/posts/:id/comments', async (req, res) => {
  const postId = req.params.id;
  const commentId = 'c1';

  await logger.logFromRequest(req, {
    eventType: 'COMMENT_ADDED',
    description: 'User added a comment',
    metadata: { postId, commentId },
  });

  res.json({ ok: true });
});

// DELETE COMMENT
router.delete('/comments/:id', async (req, res) => {
  const commentId = req.params.id;

  await logger.logFromRequest(req, {
    eventType: 'COMMENT_DELETED',
    description: 'User deleted a comment',
    metadata: { commentId },
  });

  res.json({ ok: true });
});


/* ========== LIKES ========== */

// LIKE POST
router.post('/posts/:id/like', async (req, res) => {
  const postId = req.params.id;

  await logger.logFromRequest(req, {
    eventType: 'LIKE_ADDED',
    description: 'User liked a post',
    metadata: { postId },
  });

  res.json({ ok: true });
});

// UNLIKE POST
router.post('/posts/:id/unlike', async (req, res) => {
  const postId = req.params.id;

  await logger.logFromRequest(req, {
    eventType: 'LIKE_REMOVED',
    description: 'User unliked a post',
    metadata: { postId },
  });

  res.json({ ok: true });
});


/* ========== FOLLOW ========== */

// FOLLOW USER
router.post('/users/:id/follow', async (req, res) => {
  const followingId = req.params.id;

  // event from follower perspective
  await logger.logFromRequest(req, {
    eventType: 'USER_FOLLOWS',
    description: 'User followed someone',
    metadata: { followingId },
  });

  // event for the person being followed
  await logger.logFromRequest(req, {
    eventType: 'SOMEONE_FOLLOWS_YOU',
    description: 'User was followed',
    userId: followingId,
    username: 'dummyTarget', // in real code use DB username
    metadata: { followerId: req.user._id },
  });

  res.json({ ok: true });
});

// UNFOLLOW USER
router.post('/users/:id/unfollow', async (req, res) => {
  const followingId = req.params.id;

  await logger.logFromRequest(req, {
    eventType: 'USER_UNFOLLOWS',
    description: 'User unfollowed someone',
    metadata: { followingId },
  });

  res.json({ ok: true });
});


/* ========== MESSAGES ========== */

// SEND MESSAGE
router.post('/messages', async (req, res) => {
  const recipientId = 'uTarget';
  const messageId = 'm1';

  await logger.logFromRequest(req, {
    eventType: 'MESSAGE_SENT',
    description: 'User sent a message',
    metadata: { recipientId, messageId },
  });

  // received event
  await logger.logFromRequest(req, {
    eventType: 'MESSAGE_RECEIVED',
    description: 'User received a message',
    userId: recipientId,
    username: 'targetUser',
    metadata: { senderId: req.user._id, messageId },
  });

  res.json({ ok: true });
});

// READ MESSAGE
router.post('/messages/:id/read', async (req, res) => {
  const messageId = req.params.id;

  await logger.logFromRequest(req, {
    eventType: 'MESSAGE_READ',
    description: 'User read a message',
    metadata: { messageId },
  });

  res.json({ ok: true });
});


/* ========== PROFILE / AVATAR ========== */

// PROFILE UPDATE
router.post('/profile/update', async (req, res) => {
  const updates = { bio: 'hello', city: 'NYC' };

  await logger.logFromRequest(req, {
    eventType: 'PROFILE_UPDATED',
    description: 'User updated profile',
    metadata: { changes: Object.keys(updates) },
  });

  res.json({ ok: true });
});

// AVATAR CHANGE
router.post('/profile/avatar', async (req, res) => {
  await logger.logFromRequest(req, {
    eventType: 'AVATAR_CHANGED',
    description: 'User changed avatar',
  });

  res.json({ ok: true });
});


/* ========== MEDIA ========== */

// MEDIA UPLOAD
router.post('/media', async (req, res) => {
  const mediaId = 'media1';
  const mediaType = 'image';

  await logger.logFromRequest(req, {
    eventType: 'MEDIA_UPLOADED',
    description: 'User uploaded media',
    metadata: { mediaId, mediaType },
  });

  res.json({ ok: true });
});

// MEDIA DELETE
router.delete('/media/:id', async (req, res) => {
  const mediaId = req.params.id;

  await logger.logFromRequest(req, {
    eventType: 'MEDIA_DELETED',
    description: 'User deleted media',
    metadata: { mediaId },
  });

  res.json({ ok: true });
});


/* ========== SEARCH ========== */

router.get('/search', async (req, res) => {
  const query = req.query.q || '';

  await logger.logFromRequest(req, {
    eventType: 'SEARCH_PERFORMED',
    description: 'User performed search',
    metadata: { query },
  });

  res.json({ ok: true, results: [] });
});


/* ========== SECURITY / ERROR ========== */

router.get('/suspicious', async (req, res) => {
  await logger.logFromRequest(req, {
    eventType: 'SUSPICIOUS_ACTIVITY',
    description: 'Suspicious behaviour detected',
    metadata: { action: 'Too many requests', path: req.originalUrl },
    priority: 'high',
  });

  res.json({ ok: true });
});

router.get('/force-error', async (req, res) => {
  try {
    throw new Error('Dummy error');
  } catch (err) {
    await logger.logFromRequest(req, {
      eventType: 'ERROR',
      description: 'Error occurred in API',
      metadata: { errorMessage: err.message, stack: err.stack },
      priority: 'high',
    });
    res.status(500).json({ error: 'Dummy error' });
  }
});
// LOGOUT
router.post('/logout', async (req, res) => {
  await logger.logFromRequest(req, {
    eventType: 'LOGOUT',
    description: 'User logged out',
  });

  res.json({ ok: true });
});
// READ MESSAGE
router.post('/messages/:id/read', async (req, res) => {
  const messageId = req.params.id;

  await logger.logFromRequest(req, {
    eventType: 'MESSAGE_READ',
    description: 'User read a message',
    metadata: { messageId },
  });

  res.json({ ok: true });
});

// SEND MESSAGE
router.post('/messages', async (req, res) => {
  const recipientId = 'uTarget';
  const messageId = 'm1';

  await logger.logFromRequest(req, {
    eventType: 'MESSAGE_SENT',
    description: 'User sent a message',
    metadata: { recipientId, messageId },
  });

  // received event
  await logger.logFromRequest(req, {
    eventType: 'MESSAGE_RECEIVED',
    description: 'User received a message',
    userId: recipientId,
    username: 'targetUser',
    metadata: { senderId: req.user._id, messageId },
  });

  res.json({ ok: true });
});

module.exports = router;
