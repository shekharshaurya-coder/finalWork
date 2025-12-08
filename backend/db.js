// db.js
require("dotenv").config();
const mongoose = require("mongoose");
// const { createClient } = require("redis");

const {
  MONGO_URI,
  REDIS_URL,
  REDIS_PREFIX = "iglite:",
  NODE_ENV = "development",
} = process.env;

/* ----------------- MongoDB ----------------- */
async function connectMongo() {
  if (!MONGO_URI) {
    console.error("❌ MONGO_URI not set in environment. Please add it to .env");
    process.exit(1);
  }

  try {
    // Modern Mongoose no longer needs useNewUrlParser/useUnifiedTopology flags.
    await mongoose.connect(MONGO_URI, {
      // useful tuning options:
      maxPoolSize: 50,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    console.log("✅ MongoDB connected");
    mongoose.set("debug", NODE_ENV !== "production");

    // Optional connection event handlers
    mongoose.connection.on("disconnected", () =>
      console.warn("⚠️ Mongoose disconnected")
    );
    mongoose.connection.on("reconnected", () =>
      console.log("🔁 Mongoose reconnected")
    );
    mongoose.connection.on("error", (err) =>
      console.error("Mongoose error:", err && err.message ? err.message : err)
    );
  } catch (err) {
    console.error(
      "❌ MongoDB connection error:",
      err && err.message ? err.message : err
    );
    process.exit(1);
  }
}

/* ----------------- Redis ----------------- */
/* ----------------- Redis (Fixed for Upstash + Local) ----------------- */
const { createClient } = require("redis");
let redisClient = null;

async function connectRedis() {
  const redisURL = process.env.REDIS_URL;

  if (!redisURL) {
    console.warn("⚠️ REDIS_URL not set — skipping Redis");
    return null;
  }

  try {
    redisClient = createClient({
      url: redisURL,
      socket: redisURL.startsWith("rediss://")
        ? {
            tls: true,
            rejectUnauthorized: false,
          }
        : {},
      prefix: process.env.REDIS_PREFIX || "",
    });

    redisClient.on("connect", () => console.log("🔌 Redis connecting..."));
    redisClient.on("ready", () => console.log("✅ Redis ready"));
    redisClient.on("error", (err) => console.error("❌ Redis error:", err));

    await redisClient.connect();
    return redisClient;
  } catch (err) {
    console.error("❌ Redis connection failed:", err);
    redisClient = null;
    return null;
  }
}

/* ----------------- Redis Helpers ----------------- */
const redisHelpers = {
  async setJSON(key, obj, opts = {}) {
    if (!redisClient) return null;
    const str = JSON.stringify(obj);

    if (opts.ex) return redisClient.set(key, str, { EX: opts.ex });
    if (opts.px) return redisClient.set(key, str, { PX: opts.px });
    return redisClient.set(key, str);
  },

  async getJSON(key) {
    if (!redisClient) return null;
    const raw = await redisClient.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  },

  client() {
    return redisClient;
  },
};

/* ----------------- Graceful shutdown ----------------- */
function setupShutdown() {
  const graceful = async (sig) => {
    console.log(`\n🛑 Received ${sig}. Closing DB connections...`);
    try {
      if (redisClient && redisClient.isOpen) {
        try {
          await redisClient.quit();
        } catch (e) {
          /* swallow */
        }
        console.log("🔌 Redis connection closed");
      }
      if (mongoose.connection && mongoose.connection.readyState === 1) {
        await mongoose.connection.close(false);
        console.log("🧩 MongoDB connection closed");
      }
    } catch (e) {
      console.error("Error during shutdown:", e);
    } finally {
      process.exit(0);
    }
  };

  process.once("SIGINT", () => graceful("SIGINT"));
  process.once("SIGTERM", () => graceful("SIGTERM"));
}

/* ----------------- Main connect function ----------------- */
async function connectDB() {
  await connectMongo();
  await connectRedis();

  console.log("🚀 DATABASE CONNECTED SUCCESSFULLY");

  // set up graceful shutdown handlers only once
  setupShutdown();

  return {
    mongoose,
    redisClient,
    redisHelpers,
  };
}

/* ----------------- Exports ----------------- */
/**
 * Primary export is a function so both of these usage patterns work:
 *   const connectDB = require('./db'); await connectDB();
 *   const db = require('./db'); await db.connect();
 */
module.exports = connectDB;
module.exports.connect = connectDB;
module.exports.connectDB = connectDB;
module.exports.mongoose = mongoose;
module.exports.redisHelpers = redisHelpers;
module.exports.getRedisClient = () => redisClient;

/* ----------------- Automatic run when executed directly ----------------- */
if (require.main === module) {
  // If you run `node db.js` we will execute connectDB so you see console logs immediately.
  (async () => {
    try {
      await connectDB();
      // keep process alive briefly so logs are visible in some consoles (optional)
      setTimeout(() => {
        console.log(
          "db.js executed directly — exiting (you can remove this timeout if you prefer)"
        );
        // process.exit(0);
      }, 500);
    } catch (err) {
      console.error(
        "Fatal error connecting DB:",
        err && err.message ? err.message : err
      );
      process.exit(1);
    }
  })();
}
