const IORedis = require("ioredis");

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

const redis = new IORedis(REDIS_URL, {
  tls: REDIS_URL?.startsWith("rediss://") ? { rejectUnauthorized: false } : undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redis.on("connect", () => console.log("🔗 Connected to Redis"));
redis.on("error", (e) => {
  console.error("❌ Redis connection error:", e.message);
});

module.exports = redis;
