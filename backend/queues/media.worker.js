const { Worker } = require("bullmq");
const IORedis = require("ioredis");
const Media = require("../models/Media");
const path = require("path");
const connectDB = require("../db");

connectDB();

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

const connection = new IORedis(REDIS_URL, {
  tls: REDIS_URL?.startsWith("rediss://") ? { rejectUnauthorized: false } : undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

connection.on("connect", () => console.log("🔗 Media worker Redis connected"));
connection.on("error", (e) => {
  console.error("❌ Media worker Redis error:", e.message);
});

new Worker(
  "media_queue",
  async (job) => {
    const { userId, filePath } = job.data;

    const filename = path.basename(filePath);

    await Media.create({
      ownerType: "User",
      ownerId: userId,
      url: "/uploads/" + filename,
      storageKey: filename,
      mimeType: null,
      width: null,
      height: null,
      duration: null,
      sizeBytes: null,
      processed: true,
    });

    return { status: "saved" };
  },
  { connection }
);

console.log("🚀 Media Worker Running...");
