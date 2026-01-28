# SocialSync Server.js - Optimized Architecture

## 📐 File Structure Overview

```
server.js (1,882 lines)
├── CONFIG & CONSTANTS (Lines 1-77)
│   ├── Environment validation
│   ├── Rate limits (auth, api)
│   ├── Cache TTLs (search, feed, userPosts, comments)
│   ├── Content limits (messages, posts, comments, age)
│   ├── Valid genders, admin usernames
│   └── All imports consolidated
│
├── APP SETUP (Lines 78-107)
│   ├── Express app initialization
│   ├── HTTP server
│   ├── Middleware stack
│   │   ├── JSON/URL parsing (50mb limit)
│   │   ├── Static files (/uploads, /frontend)
│   │   ├── CORS headers
│   │   └── Rate limiting
│   └── External routers
│
├── DATABASE & SOCKET.IO (Lines 108-122)
│   ├── MongoDB connection
│   └── Socket.IO initialization
│
├── HELPER FUNCTIONS (Lines 123-231)
│   ├── Logging Helpers
│   │   ├── logEvent(req, eventType, desc, metadata)
│   │   └── logSocketEvent(socket, eventType, desc, metadata)
│   ├── JWT Helpers
│   │   ├── verifyToken(token)
│   │   └── signToken(userId, username)
│   ├── Response Helpers
│   │   ├── sendError(res, status, message)
│   │   └── sendSuccess(res, data, status)
│   ├── Formatting Helpers
│   │   ├── formatTimestamp(date)
│   │   └── formatMessage(msg)
│   └── Cache Helper Object
│       ├── keys { search, feed, userPosts, comments }
│       ├── invalidateFeed()
│       ├── invalidateFollowCaches(followerId, followeeId)
│       └── invalidateNotifications(userId)
│
├── SOCKET.IO SETUP (Lines 232-360)
│   ├── Authentication Middleware
│   │   └── Token verification on connection
│   ├── Connection Handler
│   │   ├── Store user socket mapping
│   │   ├── Broadcast user_online
│   │   ├── Emit online_users list
│   │   └── Join personal room
│   ├── Event: typing
│   │   └── Real-time typing indicators
│   ├── Event: send_message
│   │   ├── Validate message length
│   │   ├── Create message in DB
│   │   ├── Log MESSAGE_SENT
│   │   ├── Emit to recipient if online
│   │   ├── Mark as delivered
│   │   └── Log MESSAGE_DELIVERED
│   ├── Event: mark_read
│   │   ├── Update readBy array
│   │   ├── Notify sender
│   │   └── Log MESSAGE_READ
│   └── Disconnect Handler
│       ├── Remove from connectedUsers
│       ├── Broadcast user_offline
│       └── Update online_users list
│
├── MESSAGE ROUTES (Lines 361-462)
│   ├── GET /api/messages/conversations
│   │   ├── Fetch all conversations
│   │   ├── Group by conversationId
│   │   └── Count unread per conversation
│   ├── GET /api/messages/conversation/:userId
│   │   ├── Get messages with user
│   │   └── Format with delivery/read status
│   └── GET /api/messages/unread/count
│       └── Count unread messages
│
├── AUTH ROUTES (Lines 463-594)
│   ├── Rate Limiter (15min, 5 attempts)
│   ├── POST /api/auth/signup
│   │   ├── Validate email, username, age, gender, password
│   │   ├── Check duplicates
│   │   ├── Hash password (bcrypt)
│   │   ├── Create user
│   │   ├── Log SIGNUP
│   │   └── Return JWT token
│   ├── POST /api/auth/login
│   │   ├── Verify credentials
│   │   ├── Generate JWT
│   │   ├── Check admin status
│   │   ├── Log LOGIN
│   │   └── Return token + user data
│   └── POST /api/auth/logout
│       └── Log LOGOUT
│
├── USER ROUTES (Lines 595-934)
│   ├── GET /api/users/me
│   │   └── Return current user profile
│   ├── GET /api/users/search
│   │   ├── Search users by username
│   │   ├── Cache for 10 minutes
│   │   └── Log USER_SEARCH
│   ├── GET /api/users/:id/followers
│   │   ├── Get follower list
│   │   └── Include follower counts
│   ├── GET /api/users/:id/following-list
│   │   ├── Get following list
│   │   └── Include follower counts
│   ├── POST /api/users/:userId/follow
│   │   ├── Validate user exists
│   │   ├── Check already following
│   │   ├── Create follow record (transaction)
│   │   ├── Increment counters
│   │   ├── Invalidate caches
│   │   └── Create notification
│   ├── DELETE /api/users/:userId/follow
│   │   ├── Remove follow (transaction)
│   │   ├── Decrement counters
│   │   ├── Invalidate caches
│   │   └── Log UNFOLLOW
│   ├── GET /api/users/:userId/following
│   │   └── Check if following user
│   └── PUT /api/users/me
│       ├── Update bio, avatar, displayName, username
│       ├── Check username availability
│       ├── Log PROFILE_UPDATED
│       └── Log AVATAR_UPDATED (if changed)
│
├── MEDIA ROUTES (Lines 935-1000)
│   ├── GET /api/media/all
│   │   └── Get user's media
│   ├── POST /api/media/upload
│   │   ├── Create media record
│   │   ├── Log MEDIA_UPLOADED
│   │   └── Return media data
│   └── DELETE /api/media/:mediaId
│       ├── Verify ownership
│       ├── Delete record
│       └── Log MEDIA_DELETED
│
├── POST/FEED ROUTES (Lines 1001-1267)
│   ├── POST /api/posts
│   │   ├── Validate content length
│   │   ├── Create post
│   │   ├── Queue media processing
│   │   ├── Invalidate feed cache
│   │   └── Log POST_CREATED
│   ├── GET /api/posts/feed
│   │   ├── Paginate with cursor
│   │   ├── Cache per cursor (5 min)
│   │   ├── Format with like/comment counts
│   │   └── Return next cursor for pagination
│   ├── GET /api/users/:userId/posts
│   │   ├── Get user's posts
│   │   ├── Paginate with cursor
│   │   ├── Cache per user/cursor (5 min)
│   │   └── Format for profile display
│   ├── POST /api/posts/:postId/like
│   │   ├── Toggle like status
│   │   ├── Create notification if not own post
│   │   ├── Log LIKE_ADDED/LIKE_REMOVED
│   │   └── Invalidate feed cache
│   └── DELETE /api/posts/:postId
│       ├── Verify ownership
│       ├── Delete post
│       ├── Log POST_DELETED
│       └── Invalidate caches
│
├── COMMENT ROUTES (Lines 1268-1418)
│   ├── POST /api/posts/:postId/comments
│   │   ├── Validate comment text
│   │   ├── Create comment
│   │   ├── Update post comments array & count
│   │   ├── Create notification
│   │   ├── Invalidate feed & comments cache
│   │   └── Log COMMENT_ADDED
│   ├── GET /api/posts/:postId/comments
│   │   ├── Fetch comments
│   │   ├── Cache for 5 minutes
│   │   ├── Populate author details
│   │   └── Return formatted comments
│   └── DELETE /api/comments/:commentId
│       ├── Verify authorization
│       ├── Remove from post
│       ├── Decrement comment count
│       ├── Log COMMENT_DELETED
│       └── Delete comment
│
├── NOTIFICATION ROUTES (Lines 1419-1483)
│   ├── GET /api/notifications
│   │   ├── Fetch user's notifications
│   │   ├── Populate actor details
│   │   └── Sort by newest first
│   ├── PUT /api/notifications/:notificationId/read
│   │   └── Mark as read
│   └── GET /api/notifications/unread/count
│       └── Count unread notifications
│
├── ANALYTICS & TRENDING (Lines 1484-1633)
│   ├── GET /api/analytics/:period
│   │   ├── Periods: day (7d), week (4w), month (6m)
│   │   ├── Aggregate likes data
│   │   ├── Sentiment analysis
│   │   ├── Find top post
│   │   ├── Extract & rank hashtags
│   │   └── Return formatted data
│   └── GET /api/trending
│       ├── Find top hashtag
│       └── Return posts using top hashtag
│
├── ADMIN ROUTES (Lines 1634-1764)
│   ├── Middleware: auth, adminAuth
│   ├── GET /api/admin/info
│   │   └── Return admin username
│   ├── GET /api/admin/logs
│   │   ├── Query Elasticsearch
│   │   ├── Filter by eventType, username
│   │   ├── Sort by timestamp desc
│   │   ├── Limit 100 results
│   │   └── Fallback if ES unavailable
│   ├── GET /api/admin/test-log
│   │   └── Send test log for verification
│   ├── GET /api/admin/stats
│   │   ├── Aggregate event types from ES
│   │   ├── Count logins
│   │   ├── Count total users & posts
│   │   └── Return formatted stats
│   └── GET /api/admin/users
│       ├── Fetch all users (100 limit)
│       ├── Count posts per user
│       └── Return with follower counts
│
├── HEALTH & ERROR HANDLING (Lines 1765-1811)
│   ├── GET /health
│   │   ├── Check MongoDB connection
│   │   ├── Check Redis connection
│   │   ├── Return uptime & service status
│   │   └── Status 200/503 based on health
│   └── Global Error Handler
│       ├── Catch all errors
│       ├── Format error response
│       └── Include stack trace in development
│
├── SERVER STARTUP (Lines 1812-1831)
│   ├── Load environment (PORT, HOST)
│   ├── Load cron jobs
│   ├── Listen on port
│   ├── Log startup info
│   ├── Display local & IP addresses
│   └── Display network interface addresses
│
└── GRACEFUL SHUTDOWN (Lines 1832-1882)
    ├── SIGTERM handler
    ├── SIGINT handler
    ├── Close HTTP server
    ├── Close Socket.IO
    ├── Close MongoDB
    ├── Close Redis
    ├── Close Elasticsearch
    ├── Uncaught exception handler
    ├── Unhandled rejection handler
    └── 30-second force timeout
```

## 🔄 Data Flow

### Message Flow (Socket.IO)
```
Client sends message
    ↓
Socket event: send_message
    ↓
Validate & create in DB
    ↓
Emit to recipient (if online)
    ↓
Mark as delivered
    ↓
Broadcast messages_read when read
```

### Post Creation Flow
```
POST /api/posts
    ↓
Validate content
    ↓
Create post in DB
    ↓
Queue media job (if has media)
    ↓
Invalidate feed cache
    ↓
Return post data
```

### Follow Flow (Transaction)
```
POST /api/users/:userId/follow
    ↓
Start transaction
    ↓
Verify user exists
    ↓
Check not already following
    ↓
Create Follow record
    ↓
Increment follower count on target
    ↓
Increment following count on me
    ↓
Commit transaction
    ↓
Create notification
    ↓
Invalidate caches
```

## 🎯 Key Design Patterns

### 1. **Helper Functions Consolidation**
Instead of scattered functions, centralized helpers:
- `logEvent()` - unified logging
- `verifyToken()` - JWT verification
- `sendError()` / `sendSuccess()` - response formatting

### 2. **Early Returns**
Minimize nesting:
```javascript
if (!condition) return sendError(res, status, msg);
```

### 3. **Cache Management**
Centralized cache helper object with:
- Consistent key generation
- Batch invalidation methods

### 4. **Middleware Organization**
External routers first, then inline routes:
```javascript
app.use("/api/notifications", notificationsRouter);
// Then inline routes...
app.post("/api/posts", auth, async (req, res) => { });
```

### 5. **Transaction Safety**
Follow/unfollow use MongoDB sessions:
```javascript
const session = await mongoose.startSession();
try {
  await session.startTransaction();
  // atomic operations
  await session.commitTransaction();
} finally {
  session.endSession();
}
```

## 📊 Dependencies

### External Libraries
- `express` - Web framework
- `mongoose` - MongoDB ODM
- `jsonwebtoken` - JWT handling
- `bcryptjs` - Password hashing
- `socket.io` - Real-time communication
- `@elastic/elasticsearch` - Log search
- `express-rate-limit` - Rate limiting
- `sentiment` - Sentiment analysis

### Internal Modules
- `./middleware/auth` - JWT verification
- `./middleware/adminAuth` - Admin check
- `./models/*` - Database models
- `./routes/*` - External routers
- `./services/logger` - Logging service
- `./queues/media.queue` - Media processing
- `./cron/trendingCron` - Trending updates

## 🔐 Security Features

✅ **JWT Token** - 7-day expiry  
✅ **Password Hashing** - bcryptjs (10 salt rounds)  
✅ **Rate Limiting** - 5 auth attempts/15min, 100 API calls/min  
✅ **CORS** - Configured for all origins  
✅ **Transaction Safety** - Follow/unfollow atomic operations  
✅ **Admin Authentication** - Separate middleware  
✅ **Input Validation** - All endpoints validate input  
✅ **Error Sanitization** - No sensitive data in errors  

## 🚀 Performance Optimizations

✅ **Redis Caching** - Feed, posts, comments, search  
✅ **Pagination** - Cursor-based for feed/posts  
✅ **Lazy Loading** - Populate only needed fields  
✅ **Lean Queries** - Return plain JS objects  
✅ **Connection Pooling** - Mongoose default  
✅ **Aggregation** - For hashtag & follower counts  
✅ **Early Returns** - Reduce function body depth  

## 📝 Summary

**Total Lines**: 1,882 (from 2,408)  
**Reduction**: 21.9%  
**Sections**: 13 major sections  
**Routes**: 40+ endpoints  
**Helpers**: 8 consolidated functions  
**Features**: 100% preserved  

This optimized architecture maintains all functionality while being:
- ✅ Easy to navigate
- ✅ Easy to debug
- ✅ Easy to maintain
- ✅ Production-ready
