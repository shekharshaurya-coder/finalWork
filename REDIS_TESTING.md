# Redis Caching - Testing Checklist

## Pre-Testing Setup

- [ ] Redis installed and running
- [ ] `REDIS_URL` set in `.env` file
- [ ] Server restarted with `node server.js`
- [ ] Check console shows: `✅ Redis ready`

---

## Testing Cached Endpoints

### 1. User Search Caching ✓

```bash
# First request (cache miss - slower)
curl "http://localhost:3000/api/users/search?q=john" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Second request (cache hit - faster)
curl "http://localhost:3000/api/users/search?q=john" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Console Output:**

```
✅ Search cache hit for: john
```

**Expected:** 2nd request is 10-20x faster

---

### 2. Feed Caching ✓

```bash
# First request (cache miss - slower, ~200-500ms)
curl "http://localhost:3000/api/posts/feed" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Second request (cache hit - faster, ~5ms)
curl "http://localhost:3000/api/posts/feed" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Console Output:**

```
✅ Feed cache hit
```

**Expected:** 2nd request much faster

---

### 3. Comments Caching ✓

```bash
# Replace POSTID with actual post ID
curl "http://localhost:3000/api/posts/POSTID/comments"

# Second request (cache hit)
curl "http://localhost:3000/api/posts/POSTID/comments"
```

**Expected Console Output:**

```
✅ Comments cache hit for post: POSTID
```

---

### 4. Unread Notifications Caching ✓

```bash
curl "http://localhost:3000/api/notifications/unread/count" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Second request (cache hit)
curl "http://localhost:3000/api/notifications/unread/count" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Console Output:**

```
✅ Unread count cache hit
```

---

## Testing Cache Invalidation

### 1. Create Post Clears Feed Cache ✓

```bash
# Step 1: Get feed (caches results)
curl "http://localhost:3000/api/posts/feed" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Step 2: Create a post (should clear cache)
curl -X POST "http://localhost:3000/api/posts" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"Hello world!"}'

# Step 3: Get feed (cache should be cleared, DB queried)
curl "http://localhost:3000/api/posts/feed" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:** No "cache hit" message on step 3

---

### 2. Like Post Clears Feed Cache ✓

```bash
# Like a post (should clear feed cache)
curl -X POST "http://localhost:3000/api/posts/POSTID/like" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Verify cache cleared (should miss on next feed request)
curl "http://localhost:3000/api/posts/feed" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:** Cache cleared and re-fetched from DB

---

### 3. Comment Clears Caches ✓

```bash
# Post a comment (should clear feed + comments caches)
curl -X POST "http://localhost:3000/api/posts/POSTID/comments" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"Great post!"}'

# Check comments (cache should be cleared)
curl "http://localhost:3000/api/posts/POSTID/comments"

# Check feed (cache should be cleared)
curl "http://localhost:3000/api/posts/feed" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:** Both caches cleared and refreshed

---

### 4. Follow/Unfollow Clears Caches ✓

```bash
# Follow a user (clears follow caches)
curl -X POST "http://localhost:3000/api/users/USERID/follow" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Check follow status (should be cache miss)
curl "http://localhost:3000/api/users/USERID/following" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Second request (should hit new cache)
curl "http://localhost:3000/api/users/USERID/following" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:** First check misses (fresh from DB), second hits cache

---

## Redis CLI Verification

```bash
# Connect to Redis
redis-cli

# View all cache keys
> KEYS *

# Check specific cache
> GET "search:users:john"
> GET "feed:posts:latest"

# View cache size
> INFO memory

# Monitor cache in real-time
> MONITOR

# Clear all caches (for testing)
> FLUSHALL
```

---

## Performance Testing

### Load Test Script (simulate concurrent requests):

```bash
# Install Apache Bench
# Windows: choco install apache-bench
# Mac: brew install httpd
# Linux: sudo apt-get install apache2-utils

# Test uncached endpoint (first request)
ab -n 1 -c 1 -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/posts/feed

# Test cached endpoint (repeated requests)
ab -n 100 -c 10 -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/posts/feed
```

**Expected:** Cached requests handle 10-50x more requests/sec

---

## Troubleshooting Tests

### Cache not working?

1. **Check Redis Connection:**

   ```bash
   redis-cli ping
   # Should return: PONG
   ```

2. **Check Cache Keys in Redis:**

   ```bash
   redis-cli KEYS "*"
   # Should see: search:users:*, feed:posts:latest, etc.
   ```

3. **Check Server Logs:**

   - Look for `✅ Redis ready` on startup
   - Look for cache hit messages on requests

4. **Force Clear Cache:**

   ```bash
   redis-cli FLUSHALL
   # Then restart server
   ```

5. **Check REDIS_URL:**
   ```bash
   # In your .env file, verify:
   REDIS_URL=redis://localhost:6379
   ```

---

## Response Time Comparison

### Before Redis:

```
GET /api/posts/feed
Time: ~300ms (200-400ms range)
```

### After Redis (first request):

```
GET /api/posts/feed
Time: ~300ms (first time, caches result)
```

### After Redis (cached):

```
GET /api/posts/feed
Time: ~5ms (100x faster!)
```

---

## Final Verification Checklist

- [ ] Server starts with "✅ Redis ready"
- [ ] Search results show cache hit on 2nd request
- [ ] Feed caching works (10+ requests cached)
- [ ] Comments caching works per post
- [ ] Notifications count cached
- [ ] Creating post clears feed cache
- [ ] Liking post clears feed cache
- [ ] Posting comment clears comment cache
- [ ] Following user clears follow cache
- [ ] No errors in console
- [ ] Response times dramatically improved
- [ ] Redis CLI shows cache keys with `KEYS *`

---

## Performance Metrics to Track

```javascript
// Add this to any endpoint to track:
const start = Date.now();
// ... endpoint logic ...
console.log(`⏱️ ${endpoint} took ${Date.now() - start}ms`);
```

**Expected Improvements:**

- Cached: <10ms
- Uncached: 100-500ms
- Ratio: 10-50x improvement

---

**Test Status:** Ready to validate ✅
**Estimated Test Time:** 15-30 minutes
**Difficulty Level:** Easy
