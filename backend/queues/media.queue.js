const { Queue } = require("bullmq");
const IORedis = require("ioredis");

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

const connection = new IORedis(REDIS_URL, {
  tls: REDIS_URL?.startsWith("rediss://") ? { rejectUnauthorized: false } : undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

connection.on("connect", () => console.log("🔗 Media queue Redis connected"));
connection.on("error", (e) => {
  console.error("❌ Media queue Redis error:", e.message);
});

let mediaQueue;
try {
  mediaQueue = new Queue("media_queue", { connection });
} catch (err) {
  console.warn("⚠️ Media queue initialization error:", err.message);
  // Create a stub that will work later
  mediaQueue = {
    add: async () => {
      console.warn("⚠️ Media queue not ready");
      return null;
    },
  };
}

module.exports = mediaQueue;
