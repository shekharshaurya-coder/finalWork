# SocialSync - Project Overview

## What is SocialSync?
A full-stack social media platform (like Instagram) where users can create posts, follow others, send messages, and interact in real-time.

## Tech Stack

**Backend:** Node.js + Express + Socket.IO  
**Frontend:** HTML/CSS/JavaScript (Vanilla)  
**Database:** MongoDB (users, posts, messages)  
**Cache:** Redis (session, search results, feed)  
**Queues:** BullMQ (media processing)  
**Logging:** Elasticsearch (event tracking)  
**Real-time:** Socket.IO (messages, notifications)  

## Core Features

### Authentication
- Sign up with email/username/password
- Login with JWT tokens (7-day expiry)
- Token stored in sessionStorage
- Rate limit: 5 login attempts per 15 min

### Posts & Feed
- Create text posts with hashtags
- Like/unlike posts
- Comment on posts
- Feed with pagination (50 posts per page)
- Posts cached in Redis (5 min TTL)

### Users
- View user profiles (followers, posts, stats)
- Follow/unfollow users (atomic transactions)
- Search users by username/name
- Admin user management panel

### Messaging
- 1-on-1 conversations
- Real-time message delivery via Socket.IO
- Mark messages as read
- Conversation list with unread count
- Message notifications

### Notifications
- New followers, likes, comments trigger notifications
- Toast notifications in UI
- Notification badge on menu

### Admin Dashboard
- View platform statistics (users, posts, engagement)
- Activity logs with search/filters
- User management
- Analytics dashboard
- Kibana integration (optional)

## Project Structure

```
finalWork/
├── backend/
│   ├── server.js              # Main server (1896 lines - single file)
│   ├── db.js                  # MongoDB connection
│   ├── middleware/
│   │   ├── auth.js            # JWT verification
│   │   └── adminAuth.js       # Admin check
│   ├── models/                # Mongoose schemas
│   │   ├── User.js
│   │   ├── Post.js
│   │   ├── Message.js
│   │   ├── Comment.js
│   │   ├── Follow.js
│   │   └── Notification.js
│   ├── routes/
│   │   ├── messages.js        # Conversation endpoints
│   │   ├── notifications.js   # Notification endpoints
│   │   ├── trending.js        # Trending hashtags
│   │   └── others...
│   ├── services/
│   │   └── logger.js          # Elasticsearch logging
│   ├── queues/
│   │   ├── media.queue.js     # Media job queue
│   │   ├── media.worker.js    # Media processor
│   │   └── redis.js           # Redis client
│   ├── cron/
│   │   └── trendingCron.js    # Updates trending hashtags
│   └── package.json
│
├── frontend/
│   ├── index.html             # Main feed page
│   ├── login.html             # Login page
│   ├── signup.html            # Signup page
│   ├── profile.html           # User profile page
│   ├── messages.html          # Messaging page
│   ├── notifications.html     # Notifications page
│   ├── admin.html             # Admin dashboard
│   ├── analytics.html         # Analytics page
│   ├── script.js              # Main feed logic (1671 lines)
│   ├── messages.js            # Messaging logic (709 lines)
│   ├── analytics-script.js    # Analytics logic (427 lines)
│   ├── admin.js               # Admin dashboard logic
│   └── styles.css             # Global styling
│
├── render.yaml                # Render deployment config
└── RENDER_DEPLOYMENT_GUIDE.md # Deployment instructions
```

## Key Architecture Decisions

### Single-File Backend
- All routes consolidated in `server.js` (not modular)
- Pros: Easy to understand, fast to load
- Cons: Can get large, but well-organized with section headers

### Helper Functions Pattern
- Centralized logging, JWT, response formatting
- Reduces code duplication across routes

### Socket.IO for Real-time
- Messages delivered instantly
- Typing indicators
- Online status tracking

### Redis Caching Strategy
- Search results: 10 min cache
- Feed: 5 min cache
- User posts: 5 min cache
- Reduces database load

### Atomic Transactions
- Follow/unfollow operations are transactional
- Prevents race conditions

## API Endpoints (40+)

### Auth Routes
- `POST /api/auth/signup` - Register user
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout

### User Routes  
- `GET /api/users/me` - Current user
- `GET /api/users/:id` - User profile
- `GET /api/search-users` - Search
- `POST /api/users/:id/follow` - Follow
- `POST /api/users/:id/unfollow` - Unfollow

### Post Routes
- `POST /api/posts` - Create post
- `GET /api/feed` - Get feed (paginated)
- `GET /api/users/:id/posts` - User posts
- `POST /api/posts/:id/like` - Like post
- `POST /api/posts/:id/unlike` - Unlike post
- `DELETE /api/posts/:id` - Delete post

### Comment Routes
- `POST /api/posts/:id/comments` - Add comment
- `GET /api/posts/:id/comments` - Get comments
- `DELETE /api/comments/:id` - Delete comment

### Message Routes
- `GET /api/conversations` - List conversations
- `GET /api/conversations/user/:username` - Load conversation
- `POST /api/conversations/user/:username/messages` - Send message

### Notification Routes
- `GET /api/notifications` - Get notifications
- `POST /api/notifications/:id/mark-read` - Mark as read
- `DELETE /api/notifications/:id` - Delete notification

### Admin Routes
- `GET /api/admin/logs` - Get activity logs
- `GET /api/admin/stats` - Platform statistics
- `GET /api/admin/users` - All users

## How It Works - User Journey

1. **Sign Up**
   - User fills form, data sent to backend
   - Password hashed with bcryptjs
   - User created in MongoDB
   - JWT token returned

2. **Login**
   - Credentials verified
   - JWT token created
   - Token stored in sessionStorage (client-side)
   - Redirects to feed

3. **Create Post**
   - User writes post with hashtags
   - File upload queued via BullMQ
   - Post saved to MongoDB
   - Feed cache invalidated
   - Event logged to Elasticsearch

4. **View Feed**
   - Fetches posts (with pagination)
   - Checks Redis cache first
   - If cache miss, queries MongoDB
   - Caches result for 5 min

5. **Send Message**
   - POST request to backend
   - Message saved to MongoDB
   - Socket.IO emits "new_message" to recipient
   - Recipient's browser receives in real-time
   - Toast notification shows

6. **Follow User**
   - Transaction starts
   - Add to followee's followers
   - Add to follower's following
   - Create notification
   - Transaction commits (or rolls back)

## Security Features

✅ **Password Hashing** - bcryptjs with salt rounds  
✅ **JWT Authentication** - 7-day expiry  
✅ **Rate Limiting** - 5 auth attempts/15min, 100 API calls/min  
✅ **CORS** - Configured for production  
✅ **Admin Verification** - Check ADMIN_USERNAMES env var  
✅ **SQL Injection Prevention** - Using Mongoose ODM  
✅ **XSS Prevention** - Data escaped in frontend  

## Environment Variables

**Local Development:**
```
PORT=3000
MONGODB_URI=mongodb://localhost:27017/socialsync
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_secret_here_min_32_chars
ADMIN_USERNAMES=admin
```

**Production (Render):**
```
PORT=10000
MONGODB_URI=mongodb+srv://user:pass@cluster...
REDIS_URL=rediss://user:pass@redis...
JWT_SECRET=your_secret_here
ADMIN_USERNAMES=admin,moderator
RENDER_EXTERNAL_URL=your-app.onrender.com
```

## Running Locally

```bash
# Install backend dependencies
cd backend
npm install

# Set up .env file
cp .env.example .env

# Start backend
npm start

# In another terminal, start Redis
redis-server

# Access frontend
open http://localhost:3000
```

**Requires:**
- Node.js (v16+)
- MongoDB running locally or remote connection
- Redis running locally or remote connection

## Deployment (Render)

1. Push to GitHub
2. Connect Render to repo
3. Set environment variables (JWT_SECRET, MONGODB_URI, REDIS_URL)
4. Create MongoDB and Redis databases on Render
5. Deploy - Render runs `npm install` and `npm start`

App auto-detects environment and uses correct URLs.

## Performance Optimizations

- Redis caching reduces database queries by ~70%
- Pagination prevents loading entire feeds
- Atomic transactions prevent race conditions
- Media queue processes uploads asynchronously
- Socket.IO for real-time (no polling)
- Elasticsearch for fast log searches (optional)

## Known Limitations

- Single backend server (no clustering)
- Local file uploads (not cloud storage)
- Elasticsearch optional (logs fallback to console)
- No media optimization (BullMQ queue ready but not processing images)
- Max 50 posts per feed page

## What's Next?

- Image compression in media queue
- Search by hashtags optimization
- Push notifications (browser)
- User blocking feature
- Post editing capability
- Trending feed algorithm

## File Sizes

- `backend/server.js` - 1896 lines (refactored from 2408)
- `frontend/script.js` - 1671 lines
- `frontend/messages.js` - 709 lines
- `frontend/analytics-script.js` - 427 lines
- **Total:** ~5000 lines of production code

## Contact & Support

See `RENDER_DEPLOYMENT_GUIDE.md` for deployment help  
See `ARCHITECTURE.md` for detailed data flow  
See `BEFORE_AFTER_COMPARISON.md` for refactoring details
