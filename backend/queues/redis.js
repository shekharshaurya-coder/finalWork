const IORedis = require("ioredis");

const redis = new IORedis({
  host: "127.0.0.1",
  port: 6379,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redis.on("connect", () => console.log("🔗 Connected to LOCAL Redis"));
redis.on("error", (e) => {
  console.error("❌ Redis connection error:", e.message);
});

module.exports = redis;
