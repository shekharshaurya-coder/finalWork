// seedAdmin.js
require("dotenv").config(); // optional if you run node -r dotenv/config
const path = require("path");

// adjust path if db.js is in a different folder
const connectDB = require("./db").connectDB || require("./db");
const mongoose = require("./db").mongoose;

// example user schema import - change to your actual User model path
const User = require("./models/User"); // <-- update this path

async function seed() {
  try {
    // Connect to DB (Mongo + Redis)
    const db = await connectDB();
    // If connectDB returns objects: const { mongoose, redisClient, redisHelpers } = db;

    // Check MONGO uri is present (debug)
    console.log("MONGO_URI:", process.env.MONGO_URI ? "[SET]" : "[NOT SET]");

    // Upsert admin user (change fields as per your schema)
    const adminEmail = "admin@example.com";
    const adminData = {
      name: "Admin",
      email: adminEmail,
      password: "changeme123", // ideally hash or create using your user service
      role: "admin",
    };

    // Use upsert to avoid duplicates
    const result = await User.findOneAndUpdate(
      { email: adminEmail },
      { $set: adminData },
      { upsert: true, new: true }
    );

    console.log("Seed result:", result);

    // close mongoose connection cleanly
    await mongoose.connection.close();
    console.log("Mongoose connection closed. Seed complete.");
    process.exit(0);
  } catch (err) {
    console.error("Seeding failed:", err);
    try { await mongoose.connection.close(); } catch (e) {}
    process.exit(1);
  }
}

seed();
