// redisConnection.js
const { createClient } = require("redis");
const IORedis = require("ioredis");

const REDIS_URL = process.env.REDIS_URL;

// ---------------------------
// Node-redis client: used for caching, sessions, JSON storage
// ---------------------------
const redisJSON = createClient({
  url: REDIS_URL || "redis://localhost:6379",
  socket: REDIS_URL?.startsWith("rediss://")
    ? { tls: true, rejectUnauthorized: false }
    : {},
});

redisJSON.on("error", (err) => console.error("❌ redisJSON error:", err));
redisJSON.on("ready", () => console.log("✅ redisJSON ready"));
redisJSON.connect();

// ---------------------------
// IORedis client: required by BullMQ
// ---------------------------
const redisQueue = REDIS_URL
  ? new IORedis(REDIS_URL, {
      tls: { rejectUnauthorized: false },
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    })
  : new IORedis({
      host: "127.0.0.1",
      port: 6379,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

redisQueue.on("connect", () => console.log("🔗 redisQueue connected"));
redisQueue.on("error", (e) => console.error("❌ redisQueue error:", e));

module.exports = {
  redisJSON,
  redisQueue,
};
