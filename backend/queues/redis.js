const IORedis = require("ioredis");

const redis = new IORedis({
  host: "127.0.0.1",
  port: 6379,
  maxRetriesPerRequest: null,   // IMPORTANT
  enableReadyCheck: false       // IMPORTANT
});

module.exports = redis;
