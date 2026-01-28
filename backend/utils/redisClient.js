const redis = require("redis");

let client = null;

function createClient() {
  if (!client) {
    client = redis.createClient({
      url: "redis://localhost:6379",
    });

    client.on("connect", () => console.log("🔌 Redis connecting..."));
    client.on("ready", () => console.log("✅ Redis ready"));
    client.on("error", (err) => console.error("❌ Redis error:", err));
    client.on("end", () => console.log("⚠️ Redis disconnected"));

    client.connect().catch((err) => {
      console.error("❌ Redis connection error:", err);
    });
  }

  return client;
}

async function setJSON(key, value, options = {}) {
  const redisClient = createClient();
  const payload = JSON.stringify(value);

  if (options.ex) {
    await redisClient.set(key, payload, { EX: options.ex });
  } else {
    await redisClient.set(key, payload);
  }
}

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
