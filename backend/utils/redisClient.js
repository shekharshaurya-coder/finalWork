// utils/redisClient.js
const redis = require("redis");

let client = null;

function createClient() {
  if (!client) {
    client = redis.createClient({
      // change URL if your Redis is in Docker with a different host
      url: "redis://localhost:6379",
    });

    client.on("connect", () => console.log("🔌 Redis connecting..."));
    client.on("ready", () => console.log("✅ Redis ready"));
    client.on("error", (err) => console.error("❌ Redis error:", err));
    client.on("end", () => console.log("⚠️ Redis disconnected"));

    // fire and forget connect
    client.connect().catch((err) => {
      console.error("❌ Redis connection error:", err);
    });
  }
  return client;
}

// Store JSON under a key
async function setJSON(key, value, options = {}) {
  const redisClient = createClient();
  const payload = JSON.stringify(value);

  if (options.ex) {
    // expire in seconds
    await redisClient.set(key, payload, { EX: options.ex });
  } else {
    await redisClient.set(key, payload);
  }
}

// Read JSON from a key
async function getJSON(key) {
  const redisClient = createClient();
  const data = await redisClient.get(key);
  return data ? JSON.parse(data) : null;
}

module.exports = {
  client: createClient,
  setJSON,
  getJSON,
};
