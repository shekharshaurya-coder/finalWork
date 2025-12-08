const IORedis = require("ioredis");

const redis = new IORedis(
  process.env.REDIS_URL || {
    host: "127.0.0.1",
    port: 6379,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  }
);

module.exports = redis;
