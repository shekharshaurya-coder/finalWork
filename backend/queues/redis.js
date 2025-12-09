const IORedis = require("ioredis");

let redis;


if (process.env.REDIS_URL) {
  // --- PRODUCTION (Upstash / Cloud Redis) ---
  redis = new IORedis(process.env.REDIS_URL, {
    tls: {
      rejectUnauthorized: false, // Upstash requires TLS
    },
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  console.log("🔗 Connected to CLOUD Redis");
} else {
  // --- LOCAL DEVELOPMENT ---
  redis = new IORedis({
    host: "127.0.0.1",
    port: 6379,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  console.log("🔗 Connected to LOCAL Redis");
}

module.exports = redis;
