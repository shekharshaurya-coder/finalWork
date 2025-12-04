# Redis Caching - Visual Architecture

## 📊 How Redis Caching Works

```
CLIENT REQUEST
    ↓
┌─────────────────────────────────────┐
│  ENDPOINT HANDLER                   │
│  (e.g., GET /api/posts/feed)        │
└────────┬────────────────────────────┘
         ↓
    ┌────────────────────┐
    │  Check Redis       │
    │  for cache key?    │
    └────────┬───────────┘
             ↓
         YES / NO
         ↙     ↘
        /         \
       ✅         ❌
   CACHE HIT   CACHE MISS
       ↓            ↓
    <5ms      Query MongoDB
    Return      (100-500ms)
    from       ↓
    Redis    Format result
       ↓        ↓
       │    Store in Redis
       │    (with TTL)
       │        ↓
       └────────→ Return to client
                  ↓
            CLIENT RESPONSE
```

---

## 🔄 Cache Invalidation Flow

```
DATA CHANGE EVENT
(e.g., Create Post)
       ↓
┌──────────────────────┐
│ Database Updated     │
│ (Post saved)         │
└─────────┬────────────┘
          ↓
┌──────────────────────────────┐
│ Cache Invalidation Logic     │
│ (cacheHelper function)       │
└─────────┬────────────────────┘
          ↓
      DELETE from Redis:
      └─ feed:posts:latest
      └─ notif:unread:{userId}
      └─ Follow caches (if applies)
      └─ Comment caches (if applies)
          ↓
    ┌─────────────────┐
    │ Cache Cleared   │
    │ Next request    │
    │ queries fresh   │
    │ data from DB    │
    └─────────────────┘
```

---

## 📈 Performance Timeline

```
TIME (milliseconds)
│
│  WITHOUT CACHE
│  ▲
│  │  ~300ms
│  │  (always slow)
│  │
│  └────────────────────────
│
│
│  WITH CACHE (10 concurrent requests)
│  ▲
│  │  First request:  ~300ms (cache miss, DB query)
│  │  ▐████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░
│  │
│  │  Requests 2-10:  ~5ms each (cache hits)
│  │  ▐░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
│  │
│  │  Total time: ~350ms vs ~3000ms
│  └────────────────────────
         10x faster!
```

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT APPLICATION                    │
│             (Web/Mobile Frontend)                        │
└────────────┬────────────────────────────────────────────┘
             │ HTTP/REST Requests
             ↓
┌─────────────────────────────────────────────────────────┐
│                    EXPRESS SERVER                        │
│  ┌──────────────────────────────────────────────┐       │
│  │ Routes with Caching Logic                    │       │
│  │ ✅ /api/posts/feed                           │       │
│  │ ✅ /api/users/search                         │       │
│  │ ✅ /api/posts/:id/comments                   │       │
│  │ ✅ /api/notifications/unread/count           │       │
│  │ ✅ /api/users/:id/following                  │       │
│  └──────────────────────────────────────────────┘       │
└──┬──────────────────────────┬──────────────────────┬───┘
   │                          │                      │
   │                          │                      │
   ↓                          ↓                      ↓
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│    REDIS     │      │  MONGODB     │      │   FILE SYSTEM│
│  (Cache)     │      │  (Database)  │      │  (Static)    │
│              │      │              │      │              │
│ Key-Value    │      │ Collections  │      │ Images,      │
│ Store        │      │ Documents    │      │ CSS, JS      │
│ <10ms        │      │ 100-500ms    │      │              │
└──────────────┘      └──────────────┘      └──────────────┘
```

---

## 🔑 Cache Key Hierarchy

```
CACHE KEY STRUCTURE:

  search:users:john
  ├─ search:      ← Cache type
  ├─ users:       ← Resource type
  └─ john         ← Query parameter

  feed:posts:latest
  ├─ feed:        ← Cache type
  ├─ posts:       ← Resource type
  └─ latest       ← Identifier

  post:comments:{postId}
  ├─ post:        ← Cache type
  ├─ comments:    ← Resource type
  └─ {postId}     ← Dynamic identifier

  notif:unread:{userId}
  ├─ notif:       ← Cache type
  ├─ unread:      ← Resource type
  └─ {userId}     ← Dynamic identifier

  follow:{followerId}:{followeeId}
  ├─ follow:      ← Cache type
  ├─ {followerId} ← First user ID
  └─ {followeeId} ← Second user ID
```

---

## 📊 Cache Lifecycle Example: Search Request

```
USER TYPES: "john" in search
         ↓
   FIRST REQUEST
   ─────────────────
   Time: 0ms
   └─ Check Redis key: search:users:john
      └─ KEY NOT FOUND
      └─ Query MongoDB (50ms)
      └─ Format results (5ms)
      └─ Store in Redis (2ms)
         └─ TTL set to 600 seconds
      └─ Return results to client
      TOTAL TIME: ~60ms

   SECOND REQUEST (10 seconds later)
   ──────────────────────────────────
   Time: 10 seconds
   └─ Check Redis key: search:users:john
      └─ KEY FOUND ✅
      └─ Return cached data instantly
      TOTAL TIME: <5ms

   ... (more requests use cache) ...

   SIXTH REQUEST (620 seconds later)
   ──────────────────────────────────
   Time: 620 seconds
   └─ Check Redis key: search:users:john
      └─ KEY EXPIRED (TTL was 600s)
      └─ Cache miss - query MongoDB again
      └─ Store new results in Redis
      TOTAL TIME: ~60ms
```

---

## 🔄 Cache Invalidation Example: Follow Action

```
USER CLICKS FOLLOW
       ↓
  FOLLOW ENDPOINT
  /api/users/:id/follow
       ↓
  DATABASE OPERATION
  (Insert follow record)
       ↓
  INVALIDATE CACHES
  (cacheHelper.invalidateFollowCaches)
       ↓
  DELETE FROM REDIS:
  ├─ follow:{currentUserId}:{targetUserId}
  ├─ user:followers:{targetUserId}
  └─ user:following:{currentUserId}
       ↓
  RETURN SUCCESS
       ↓
  NEXT CHECK FOLLOW REQUEST
  └─ All 3 caches MISS
  └─ Fresh data from MongoDB
  └─ NEW caches created
       ↓
  SUBSEQUENT REQUESTS (within TTL)
  └─ Cache HIT
  └─ Instant response
```

---

## 📋 Endpoint Caching Map

```
REQUEST TYPE          CACHE KEY                    TTL      OPERATION
─────────────────────────────────────────────────────────────────────
GET /users/search     search:users:{query}         10min    READ
GET /posts/feed       feed:posts:latest            3min     READ
GET /posts/:id/       post:comments:{id}           5min     READ
  comments
GET /notifications/   notif:unread:{userId}        1min     READ
  unread/count
GET /users/:id/       follow:{uid}:{tid}           30min    READ
  following

POST /posts            (invalidates)                         WRITE
                       feed:posts:latest

POST /posts/:id/like   (invalidates)                         WRITE
                       feed:posts:latest

POST /posts/:id/       (invalidates)                         WRITE
  comments             feed:posts:latest,
                       post:comments:{id}

POST /users/:id/       (invalidates)                         WRITE
  follow               follow:{...}, user:followers:{...}

DELETE /users/:id/     (invalidates)                         WRITE
  follow               follow:{...}, user:followers:{...}
```

---

## 🎯 Performance Comparison

```
SCENARIO: 100 users refreshing feed every 30 seconds

WITHOUT CACHE:
└─ 100 users × 2 refreshes/min = 200 requests/min
└─ Each request queries: Posts (1) + Users (10) = 11 DB queries
└─ 200 × 11 = 2,200 DB queries/min
└─ Response time: ~300ms per request
└─ Total response time for all users: 200 × 300ms = 60 seconds

WITH CACHE (3-minute TTL):
└─ 100 users × 2 refreshes/min = 200 requests/min
└─ First request: 1 DB query + caches for 3 min
└─ Following 5 minutes: Cache hits only
└─ 2 DB queries/min (only feed cache refresh)
└─ 2 × 100x fewer queries = 99% reduction
└─ Response time: <5ms for cached requests
└─ Total response time for all users: 200 × 5ms = 1 second

IMPROVEMENT:
└─ Queries: 2,200 → 200 (90% reduction)
└─ Response time: 60 seconds → 1 second (60x faster)
```

---

## 💾 Memory Usage Breakdown

```
CACHE COMPONENT          ITEMS    AVG SIZE    TOTAL MEMORY
─────────────────────────────────────────────────────────
Search results           100      2KB         200KB
Feed posts (1 user)      1        50KB        50KB
Comments per post        50       10KB        500KB
Unread counts            10,000   100B        1MB
Follow relationships     100,000  100B        10MB
───────────────────────────────────────────────────────
TOTAL                                        ~12MB

For comparison:
- Single high-res image: 5-20MB
- Average webpage: 2-4MB
- Redis cache: ~12MB (very efficient!)
```

---

## 🚀 Scalability Impact

```
USER GROWTH SCENARIO:

100 USERS:
├─ Without Cache: 100 × 300ms = 30 seconds total response time
├─ With Cache:    100 × 5ms = 500ms total response time
└─ Improvement: 60x faster

1,000 USERS:
├─ Without Cache: 1,000 × 300ms = 300 seconds (SLOW!)
├─ With Cache:    1,000 × 5ms = 5 seconds (FAST!)
└─ Improvement: 60x faster

10,000 USERS:
├─ Without Cache: 10,000 × 300ms = 3,000 seconds (50 minutes!)
├─ With Cache:    10,000 × 5ms = 50 seconds (OK!)
└─ Improvement: 60x faster

Redis caching makes your app scale much better!
```

---

## 🔍 Monitoring Points

```
Monitor These Metrics:

1. CACHE HIT RATE
   └─ Target: 70-90% after warmup
   └─ Tracked: Console logs show "cache hit"

2. RESPONSE TIME
   └─ Without cache: 100-500ms
   └─ With cache: <10ms
   └─ Ratio: 10-50x improvement

3. DATABASE QUERY COUNT
   └─ Without cache: N queries per request
   └─ With cache: 1 query per cache refresh
   └─ Reduction: 80-90%

4. REDIS MEMORY
   └─ Target: <50MB typical usage
   └─ Alert if: >100MB (adjust TTL)

5. EVICTION RATE
   └─ Should be: Low (< 1% of requests)
   └─ Alert if: High (increase Redis memory)
```

---

**Visual Architecture Complete!**  
See other documentation for implementation details and testing procedures.
