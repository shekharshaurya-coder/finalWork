# Render Deployment Guide

## Overview
SocialSync is now ready to deploy on Render with full support for local development and production environments.

## Deployment Steps

### 1. Prepare Your Repository
```bash
git add .
git commit -m "Ready for Render deployment"
git push origin main
```

### 2. Create Render Account & Services
- Sign up at https://render.com
- Create a new Web Service from your GitHub repository

### 3. Configure Environment Variables on Render

Set these environment variables in the Render dashboard:

```
NODE_ENV=production
PORT=10000
JWT_SECRET=<generate a strong 32+ character secret>
ADMIN_USERNAMES=admin,moderator
```

### 4. Add Render Databases

#### MongoDB (Database as a Service)
1. In Render Dashboard → New → Database → MongoDB
2. Create a database named `socialsync`
3. Get connection string: `mongodb+srv://user:pass@cluster.mongodb.net/socialsync?retryWrites=true`
4. Set as `MONGODB_URI` environment variable

#### Redis (Database as a Service)
1. In Render Dashboard → New → Database → Redis
2. Get connection string
3. Set as `REDIS_URL` environment variable

### 5. Deploy
- Link your GitHub repo to Render
- Select branch to deploy (main/master)
- Render will automatically:
  - Install dependencies: `npm install`
  - Start server: `npm start`
  - Monitor health checks at `/health`

## Environment Configuration

The application automatically detects the environment:

### Local Development
- API Base: `http://localhost:3000`
- Redis: `redis://localhost:6379` (or `REDIS_URL` from .env)
- MongoDB: From `MONGODB_URI` env var

### Production (Render)
- API Base: Uses `RENDER_EXTERNAL_URL` automatically
- Redis: Uses cloud Redis from `REDIS_URL`
- MongoDB: Uses cloud MongoDB from `MONGODB_URI`

## Frontend Configuration

Frontend URLs are now **dynamic** and work on both environments:
- `script.js` - Detects localhost vs production
- `messages.js` - Dynamic API endpoints
- `analytics-script.js` - Dynamic analytics endpoints
- `profile.html` - Dynamic profile endpoints
- `notification.html` - Dynamic notification endpoints

## Features Supported

✅ All 40+ API endpoints  
✅ Real-time messaging with Socket.IO  
✅ User authentication & admin features  
✅ Post creation, liking, commenting  
✅ Following/unfollowing system  
✅ Notifications & analytics  
✅ Media queue processing  
✅ Elasticsearch logging (optional)  

## Health Check

Test deployment health:
```bash
curl https://your-app.onrender.com/health
```

Expected response: `{"status": "✅ OK", ...}`

## Troubleshooting

### 404 on API Endpoints
- Check that routes are properly defined with `/` prefix in Express routers
- Verify MONGODB_URI and REDIS_URL are set in environment

### Socket.IO Connection Issues
- Verify RENDER_EXTERNAL_URL is set correctly
- Check CORS origin in server.js
- Ensure WebSocket support is enabled (default on Render)

### Database Connection Errors
- MongoDB: Verify connection string and whitelist IPs
- Redis: Verify TLS settings are enabled (rediss://)

### Performance Issues
- Scale up Render plan if needed
- Check MongoDB/Redis resource limits
- Monitor logs in Render dashboard

## Cost Optimization

**Free Tier Limitations:**
- Web Service: Limited CPU/memory
- MongoDB: 512MB storage
- Redis: 256MB storage

**Recommended for Production:**
- Upgrade to Starter tier or higher
- Use Dedicated instances for databases
- Enable auto-scaling

## Maintenance

### Update Dependencies
```bash
npm update
git push origin main
```
Render will automatically redeploy.

### View Logs
- In Render Dashboard → Your Service → Logs
- Filter by date/severity

### Database Backups
- MongoDB: Automated daily backups (premium)
- Redis: Manual exports or replication

## Local Development Still Works

You can continue developing locally:
```bash
# Start backend
cd backend
npm install
node server.js

# In another terminal, ensure Redis is running
redis-server

# Access frontend
open http://localhost:3000
```

All frontend endpoints will automatically use `http://localhost:3000`.

## Environment-Specific Notes

### Development (.env)
```
PORT=3000
MONGODB_URI=mongodb://localhost:27017/socialsync
REDIS_URL=redis://localhost:6379
```

### Production (Render Variables)
```
PORT=10000
MONGODB_URI=mongodb+srv://...
REDIS_URL=rediss://...
```

The application handles both automatically via `window.location.hostname` checks and environment variable detection.
