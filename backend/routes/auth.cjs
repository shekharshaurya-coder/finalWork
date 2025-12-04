const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const router = express.Router();

// POST /auth/login
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    // 1. Find user
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ message: "Invalid username or password" });
    }

    // 2. Compare password
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid username or password" });
    }

    // 3. Sign JWT in a way that matches your middleware
    const token = jwt.sign(
      {
        sub: user._id.toString(),  // <--- REQUIRED for your middleware
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }         // change duration if needed
    );

    // 4. Respond with token
    res.json({
      message: "Login successful",
      token: token,
      user: {
        id: user._id,
        username: user.username,
      }
    });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


module.exports = router;
