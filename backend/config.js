// config.js
require("dotenv").config();

module.exports = {
  MONGO_URI: process.env.MONGO_URI,
  REDIS_URL: process.env.REDIS_URL,
  REDIS_PREFIX: process.env.REDIS_PREFIX,
  PORT: process.env.PORT || 3000,
  JWT_SECRET: process.env.JWT_SECRET,
};
