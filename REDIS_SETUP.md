# Redis Setup Instructions

## Option 1: Local Redis (Windows - Easiest)

### Using Windows Subsystem for Linux (WSL):

```powershell
# In PowerShell
wsl
sudo apt-get update
sudo apt-get install redis-server
redis-server
```

### Using Docker (Recommended):

```powershell
# Pull Redis image
docker run -d -p 6379:6379 redis:latest

# Or with volume persistence:
docker run -d -p 6379:6379 -v redis-data:/data redis:latest
```

### Using Memurai (Native Windows):

1. Download: https://memurai.com/
2. Install with default settings
3. Redis runs as a Windows service automatically

---

## Option 2: Redis Cloud (Easy - No Installation)

### Setup Redis Cloud:

1. Visit: https://redis.com/cloud/
2. Sign up for free (0-1GB included)
3. Create a database
4. Copy the connection URL

### Add to `.env`:

```
REDIS_URL=redis://default:YOUR_PASSWORD@YOUR_HOST:YOUR_PORT
```

---

## Option 3: Docker Compose (Recommended for Full Setup)

Create `docker-compose.yml` in your root directory:

```yaml
version: "3.8"

services:
  mongodb:
    image: mongo:6.0
    container_name: instagram_mongo
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db
    environment:
      MONGO_INITDB_DATABASE: instagram

  redis:
    image: redis:7-alpine
    container_name: instagram_redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes

volumes:
  mongo_data:
  redis_data:
```

### Run with Docker Compose:

```powershell
docker-compose up -d
```

---

## Update `.env` File

Add this to your `.env` file in the `backend/` directory:

```env
# MongoDB
MONGO_URI=mongodb://localhost:27017/instagram

# Redis
REDIS_URL=redis://localhost:6379
REDIS_PREFIX=iglite:

# Server
PORT=3000
HOST=0.0.0.0
NODE_ENV=development
JWT_SECRET=your_jwt_secret_here_change_in_production
```

---

## Test Redis Connection

After setting up Redis and updating `.env`, restart your server:

```powershell
# In backend directory
node server.js
```

You should see:

```
✅ MongoDB connected
✅ Redis ready
🚀 DATABASE CONNECTED SUCCESSFULLY
```

---

## Verify Caching is Working

1. Search for a user and check console for: `✅ Search cache hit for: john`
2. Load feed twice and check for: `✅ Feed cache hit`
3. Create a post and check for: `Feed cache invalidation` message

---

## Monitor Redis

### Using Redis CLI:

```powershell
# Connect to Redis
redis-cli

# In Redis CLI:
> KEYS *              # List all cache keys
> GET search:users:john  # Get specific cache value
> DEL search:users:john  # Delete specific cache
> FLUSHALL            # Clear ALL caches
> INFO stats          # View cache statistics
```

### Using Docker:

```powershell
docker exec -it instagram_redis redis-cli
# Then run commands above
```

---

## Troubleshooting

**Issue:** `Error: connect ECONNREFUSED 127.0.0.1:6379`

**Solution:** Redis is not running

- Check if Redis service is running
- Try: `redis-server` (if installed locally)
- Or: `docker ps` to verify Docker container is up

**Issue:** `⚠️ REDIS_URL not set`

**Solution:** Add `REDIS_URL` to your `.env` file

**Issue:** App works but cache isn't working

**Solution:**

1. Verify Redis is connected (check logs)
2. Check cache keys: `redis-cli KEYS *`
3. Make multiple requests to same endpoint to verify cache hit

---

## Performance Check

After setup, make multiple requests and compare response times:

```bash
# First request (cache miss) - slower
curl http://localhost:3000/api/posts/feed

# Second request (cache hit) - much faster!
curl http://localhost:3000/api/posts/feed
```

**Expect:** 10-100x faster response on cached requests

---

## Next: Update package.json (if needed)

Your `package.json` already has `redis` in dependencies via the `db.js` imports. If you get module errors, install:

```powershell
npm install redis
```

---

**You're all set!** 🚀 Your Instagram clone now has Redis caching enabled.
