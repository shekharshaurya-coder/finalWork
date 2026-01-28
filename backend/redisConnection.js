// redisConnection.js
const { createClient } = require("redis");
const IORedis = require("ioredis");

// Support both local Redis and Render's Redis
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// ---------------------------
// Node-redis client: used for caching, sessions, JSON storage
// ---------------------------
const redisJSON = createClient({
  url: REDIS_URL,
  socket: REDIS_URL?.startsWith("rediss://") || REDIS_URL?.startsWith("redis://")
    ? {
        tls: REDIS_URL?.startsWith("rediss://"),
        rejectUnauthorized: false,
      }
    : {},
});

redisJSON.on("error", (err) => console.error("❌ redisJSON error:", err));
redisJSON.on("ready", () => console.log("✅ redisJSON ready"));
redisJSON.connect();

// ---------------------------
// IORedis client: required by BullMQ
// ---------------------------
const redisQueue = new IORedis(REDIS_URL, {
  tls: REDIS_URL?.startsWith("rediss://") ? { rejectUnauthorized: false } : undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redisQueue.on("connect", () => console.log("🔗 redisQueue connected"));
redisQueue.on("error", (e) => {
  console.error("❌ redisQueue error:", e.message);
});

module.exports = {
  redisJSON,
  redisQueue,
};
