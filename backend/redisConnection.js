// redisConnection.js
const { createClient } = require("redis");
const IORedis = require("ioredis");

// ---------------------------
// Node-redis client: used for caching, sessions, JSON storage
// ---------------------------
const redisJSON = createClient({
  url: "redis://localhost:6379",
});

redisJSON.on("error", (err) => console.error("❌ redisJSON error:", err));
redisJSON.on("ready", () => console.log("✅ redisJSON ready"));
redisJSON.connect();

// ---------------------------
// IORedis client: required by BullMQ
// ---------------------------
const redisQueue = new IORedis({
  host: "127.0.0.1",
  port: 6379,
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
