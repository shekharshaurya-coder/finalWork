const { Queue } = require("bullmq");
const IORedis = require("ioredis");

const connection = new IORedis({
  host: "127.0.0.1",
  port: 6379,
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
