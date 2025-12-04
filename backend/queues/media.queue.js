const { Queue } = require("bullmq");
const redis = require("./redis");

const mediaQueue = new Queue("media_queue", {
  connection: redis
});

module.exports = mediaQueue;
