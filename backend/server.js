// server.js – cleaned & aligned with frontend messages.js

require("dotenv").config();

const path = require("path");
const http = require("http");
const os = require("os");
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Sentiment = require("sentiment");
const { Server } = require("socket.io");

// ========= MODELS =========
const User = require("./models/User");
const Post = require("./models/Post");
const Follow = require("./models/Follow");
const Media = require("./models/Media");
const Comment = require("./models/Comment");
const Notification = require("./models/Notification");
const Message = require("./models/Message");

// ========= DB & REDIS =========
const connectDB = require("./db");
const { redisHelpers } = require("./db");

// ========= MISC =========
const auth = require("./middleware/auth");
const adminAuth = require("./middleware/adminAuth");
const logger = require("./services/logger");
const mediaQueue = require("./queues/media.queue");
const trendingCron = require("./cron/trendingCron"); // just require to start cron
const sentimentAnalyzer = new Sentiment();

const {
  Types: { ObjectId },
  Types,
} = mongoose;

// ========= ELASTICSEARCH =========
const { Client } = require("@elastic/elasticsearch");
const esClient = new Client({ node: "http://localhost:9200" });

// ========= ROUTERS =========
const notificationsRouter = require("./routes/notifications");
const trendingRouter = require("./routes/trending");
const logDemoRoutes = require("./routes/logDemo");
// (auth.cjs, users.js, Follow.js, messages.js are not mounted here on purpose;
//  most of their logic has been pulled into this file for now)

// ========= APP INIT =========
const app = express();
const server = http.createServer(app);

// --- core middlewares (only once) ---
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// --- CORS ---
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "https://socialsync-ow8q.onrender.com",
  process.env.FRONTEND_ORIGIN,
].filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  } else {
    res.header("Access-Control-Allow-Origin", "*");
  }
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With"
  );
  res.header("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// --- static files ---
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static(path.join(__dirname, "..", "frontend")));

app.get("/", (req, res) => {
  res.redirect("/login.html");
});

// ========= DB CONNECT =========
connectDB();

// ========= SMALL LOG WRAPPER FOR HTTP =========
async function logplease(req, eventType, description, metadata) {
  try {
    await logger.logFromRequest(req, {
      eventType,
      description,
      metadata,
    });
  } catch (err) {
    console.warn("Logger error (HTTP):", err.message);
  }
}

// ========= SOCKET.IO SETUP =========
app.set("trust proxy", 1);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Connected users map: userId -> socketId
const connectedUsers = new Map();

// Socket auth using JWT
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("Authentication error"));

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.sub || decoded.userId || decoded._id || decoded.id;
    socket.username = decoded.username;
    if (!socket.userId) return next(new Error("Invalid token payload"));
    next();
  } catch (err) {
    return next(new Error("Authentication error"));
  }
});

// Socket events
io.on("connection", (socket) => {
  console.log("✅ Socket connected:", socket.username, socket.id);

  connectedUsers.set(String(socket.userId), socket.id);
  socket.join(String(socket.userId));

  socket.broadcast.emit("user_online", {
    userId: socket.userId,
    username: socket.username,
  });

  io.emit("online_users", Array.from(connectedUsers.keys()));

  // Typing indicator
  socket.on("typing", (data) => {
    const recipientSocketId = connectedUsers.get(String(data.recipientId));
    if (recipientSocketId) {
      io.to(recipientSocketId).emit("user_typing", {
        userId: socket.userId,
        username: socket.username,
        isTyping: !!data.isTyping,
      });
    }
  });

  // Send message (socket)
  socket.on("send_message", async (data) => {
    try {
      const recipientId = String(data.recipientId);
      const senderId = String(socket.userId);

      if (!recipientId || !data.text?.trim()) return;

      const conversationId = [senderId, recipientId].sort().join("_");

      const newMessage = await Message.create({
        conversationId,
        sender: senderId,
        recipients: [recipientId],
        text: data.text.trim(),
        deliveredTo: [],
        readBy: [],
      });

      const populated = await Message.findById(newMessage._id)
        .populate("sender", "username displayName avatarUrl")
        .lean();

      const payload = {
        id: populated._id,
        conversationId,
        sender: {
          id: populated.sender._id,
          username: populated.sender.username,
          displayName:
            populated.sender.displayName || populated.sender.username,
          avatarUrl: populated.sender.avatarUrl || null,
        },
        text: populated.text,
        createdAt: populated.createdAt,
        delivered: false,
        read: false,
      };

      // to sender
      socket.emit("message_sent", payload);

      // to recipient if online
      const recipientSocketId = connectedUsers.get(recipientId);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit("new_message", payload);
        await Message.findByIdAndUpdate(newMessage._id, {
          $addToSet: { deliveredTo: recipientId },
        });
        socket.emit("message_delivered", { messageId: newMessage._id });
      }
    } catch (err) {
      console.error("Socket send_message error:", err);
      socket.emit("message_error", { error: "Failed to send message" });
    }
  });

  // Mark messages read
  socket.on("mark_read", async (data) => {
    try {
      const { conversationId, senderId } = data;
      const userId = String(socket.userId);

      const result = await Message.updateMany(
        {
          conversationId,
          sender: senderId,
          readBy: { $ne: userId },
        },
        { $addToSet: { readBy: userId } }
      );

      if (result.modifiedCount > 0) {
        const senderSocketId = connectedUsers.get(String(senderId));
        if (senderSocketId) {
          io.to(senderSocketId).emit("messages_read", {
            conversationId,
            readBy: userId,
          });
        }
      }
    } catch (err) {
      console.error("Socket mark_read error:", err);
    }
  });

  socket.on("disconnect", () => {
    console.log("❌ Socket disconnected:", socket.username, socket.id);
    connectedUsers.delete(String(socket.userId));
    socket.broadcast.emit("user_offline", { userId: socket.userId });
    io.emit("online_users", Array.from(connectedUsers.keys()));
  });
});

// Make io available in routes if needed
app.set("io", io);

// ========= SIMPLE ROUTES / DEMO =========
app.use("/demo", logDemoRoutes);

// ========= NOTIFICATION / TRENDING ROUTES =========
app.use("/api/notifications", notificationsRouter);
app.use("/api/trending", trendingRouter);

// ========= HELPERS =========

const cacheHelper = {
  keys: {
    search: (q) => `search:users:${q.toLowerCase()}`,
    userProfile: (id) => `user:profile:${id}`,
    followers: (id) => `user:followers:${id}`,
    following: (id) => `user:following:${id}`,
    feed: (cursor) => `feed:posts:${cursor || "latest"}`,
    userPosts: (userId, cursor) => `user:posts:${userId}:${cursor || "latest"}`,
    comments: (postId) => `post:comments:${postId}`,
    unreadNotifications: (userId) => `notif:unread:${userId}`,
    followStatus: (followerId, followeeId) =>
      `follow:${followerId}:${followeeId}`,
  },

  invalidateFeedCache: async () => {
    try {
      const client = redisHelpers?.client();
      if (!client) return;
      const keys = await client.keys("feed:posts:*");
      if (keys.length) await client.del(...keys);
    } catch (e) {
      console.warn("Feed cache invalidation error:", e.message);
    }
  },

  invalidateFollowCaches: async (followerId, followeeId) => {
    try {
      const client = redisHelpers?.client();
      if (!client) return;
      await client.del(
        `follow:${followerId}:${followeeId}`,
        `user:followers:${followeeId}`,
        `user:following:${followerId}`
      );
    } catch (e) {
      console.warn("Follow cache invalidation error:", e.message);
    }
  },

  invalidateNotificationCache: async (userId) => {
    try {
      const client = redisHelpers?.client();
      if (!client) return;
      await client.del(`notif:unread:${userId}`);
    } catch (e) {
      console.warn("Notification cache invalidation error:", e.message);
    }
  },
};

function formatTimestamp(date) {
  const now = new Date();
  const diff = Math.floor((now - new Date(date)) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(date).toLocaleDateString();
}

// ======================================================
// =============== AUTH ROUTES ==========================
// ======================================================

// SIGNUP
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { email, username, age, gender, password } = req.body;

    if (!email || !username || !age || !gender || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (!/^[a-zA-Z]/.test(username)) {
      return res
        .status(400)
        .json({ message: "Username must start with a letter" });
    }

    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(username)) {
      return res.status(400).json({
        message: "Username can only contain letters, numbers and underscores",
      });
    }

    const ageNum = parseInt(age, 10);
    if (isNaN(ageNum) || ageNum < 16 || ageNum > 120) {
      return res.status(400).json({ message: "Please enter a valid age" });
    }

    const validGenders = ["male", "female", "other", "prefer-not-to-say"];
    if (!validGenders.includes(gender)) {
      return res.status(400).json({ message: "Invalid gender selection" });
    }

    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      return res
        .status(400)
        .json({ message: "Password cannot contain special characters" });
    }
    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters" });
    }

    if (await User.findOne({ email })) {
      return res.status(400).json({ message: "Email already registered" });
    }
    if (await User.findOne({ username })) {
      return res.status(400).json({ message: "Username taken" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      email,
      username,
      age: ageNum,
      gender,
      passwordHash: hashed,
      displayName: username,
      bio: "",
      avatarUrl: "",
      followersCount: 0,
      followingCount: 0,
    });

    await logplease(req, "SIGNUP", "New user signed up", {
      userId: newUser._id,
      username: newUser.username,
    });

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET missing");
      return res.status(500).json({ message: "Server configuration error" });
    }

    const idStr = newUser._id.toString();
    const token = jwt.sign(
      {
        userId: idStr,
        id: idStr,
        _id: idStr,
        sub: idStr,
        username: newUser.username,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      id: newUser._id,
      userId: idStr,
      email: newUser.email,
      username: newUser.username,
      age: newUser.age,
      gender: newUser.gender,
      token,
    });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// LOGIN
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });

    if (!user) {
      return res.status(404).json({ message: "Account not found" });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ message: "Incorrect password" });
    }

    const tokenPayload = {
      sub: user._id.toString(),
      username: user.username,
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    const device = req.headers["user-agent"];
    const ip = req.ip || req.connection.remoteAddress;
    await logplease(req, "LOGIN", "User logged in", {
      userId: user._id,
      username: user.username,
      device,
      ip,
    });

    const adminUsernames =
      process.env.ADMIN_USERNAMES?.split(",").map((u) => u.trim()) || [];
    const isAdmin = adminUsernames.includes(username);

    res.json({
      token,
      isAdmin,
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName || user.username,
        email: user.email,
        bio: user.bio || "",
        avatarUrl: user.avatarUrl || "",
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error", detail: err.message });
  }
});

// DEBUG route to generate JWT quickly
app.get("/debug/jwt", (req, res) => {
  const token = jwt.sign(
    { sub: "USER_ID_HERE", username: "USERNAME_HERE" },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
  res.json({ token });
});

// LOGOUT
app.post("/api/auth/logout", auth, async (req, res) => {
  try {
    await logplease(req, "LOGOUT", "User logged out", {
      userId: req.user._id,
      username: req.user.username,
    });
    res.json({ message: "Logged out successfully" });
  } catch (err) {
    console.error("Logout error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ======================================================
// =============== USER / FOLLOW ROUTES =================
// ======================================================

// Current user
app.get("/api/users/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-passwordHash");
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      id: user._id,
      userId: user.userId,
      username: user.username,
      displayName: user.displayName || user.username,
      email: user.email,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      followersCount: user.followersCount || 0,
      followingCount: user.followingCount || 0,
    });
  } catch (err) {
    console.error("Get me error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ---- SEARCH USERS (new frontend expects /search-users) ----
app.get("/search-users", auth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || !q.trim()) {
      return res.json({ results: [] });
    }

    const cacheKey = cacheHelper.keys.search(q);

    const cached = await redisHelpers.getJSON(cacheKey);
    if (cached) {
      return res.json({ results: cached });
    }

    const users = await User.find({
      username: { $regex: q, $options: "i" },
      _id: { $ne: req.user._id },
    })
      .select("username displayName avatarUrl followersCount")
      .limit(10)
      .lean();

    const result = users.map((u) => ({
      id: u._id,
      username: u.username,
      displayName: u.displayName || u.username,
      avatarUrl: u.avatarUrl || null,
      followersCount: u.followersCount || 0,
    }));

    await redisHelpers.setJSON(cacheKey, result, { ex: 600 });

    res.json({ results: result });
  } catch (err) {
    console.error("search-users error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Followers list
app.get("/api/users/:id/followers", async (req, res) => {
  try {
    const userId = req.params.id;

    const followDocs = await Follow.find({ followee: userId }).populate(
      "follower",
      "username name avatarUrl"
    );

    if (!followDocs.length) return res.json([]);

    const ids = followDocs
      .map((f) => f.follower && f.follower._id)
      .filter(Boolean)
      .map((id) => id.toString());

    const counts = await Follow.aggregate([
      {
        $match: {
          followee: { $in: ids.map((id) => new Types.ObjectId(id)) },
        },
      },
      { $group: { _id: "$followee", count: { $sum: 1 } } },
    ]);

    const map = counts.reduce((m, c) => {
      m[c._id.toString()] = c.count;
      return m;
    }, {});

    const followers = followDocs.map((f) => {
      const u = f.follower;
      return {
        id: u._id,
        username: u.username,
        name: u.name,
        avatarUrl: u.avatarUrl || null,
        followerCount: map[u._id.toString()] || 0,
      };
    });

    res.json(followers);
  } catch (err) {
    console.error("/api/users/:id/followers error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Following list
app.get("/api/users/:id/following-list", async (req, res) => {
  try {
    const userId = req.params.id;

    const followDocs = await Follow.find({ follower: userId }).populate(
      "followee",
      "username name avatarUrl"
    );

    if (!followDocs.length) return res.json([]);

    const ids = followDocs
      .map((f) => f.followee && f.followee._id)
      .filter(Boolean)
      .map((id) => id.toString());

    const counts = await Follow.aggregate([
      {
        $match: {
          followee: { $in: ids.map((id) => new Types.ObjectId(id)) },
        },
      },
      { $group: { _id: "$followee", count: { $sum: 1 } } },
    ]);

    const map = counts.reduce((m, c) => {
      m[c._id.toString()] = c.count;
      return m;
    }, {});

    const following = followDocs.map((f) => {
      const u = f.followee;
      return {
        id: u._id,
        username: u.username,
        name: u.name,
        avatarUrl: u.avatarUrl || null,
        followerCount: map[u._id.toString()] || 0,
      };
    });

    res.json(following);
  } catch (err) {
    console.error("/api/users/:id/following-list error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Follow / Unfollow / Check (same logic as before, just cleaned)
app.post("/api/users/:userId/follow", auth, async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    const me = req.user._id.toString();

    if (!ObjectId.isValid(targetUserId)) {
      return res.status(400).json({ message: "Invalid target user id" });
    }
    if (me === targetUserId) {
      return res.status(400).json({ message: "Cannot follow yourself" });
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    try {
      const followDoc = await Follow.create({
        follower: req.user._id,
        followee: targetUserId,
        status: "accepted",
      });

      await User.findByIdAndUpdate(targetUserId, {
        $inc: { followersCount: 1 },
      });
      await User.findByIdAndUpdate(req.user._id, {
        $inc: { followingCount: 1 },
      });

      await cacheHelper.invalidateFollowCaches(me, targetUserId);

      try {
        await Notification.create({
          user: targetUserId,
          actor: req.user._id,
          verb: "follow",
          targetType: "User",
          targetId: req.user._id,
          read: false,
        });
      } catch (nerr) {
        console.warn("Follow notification failed:", nerr.message);
      }

      res.json({
        message: "Followed successfully",
        following: true,
        followId: followDoc._id,
      });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(400).json({ message: "Already following this user" });
      }
      throw err;
    }
  } catch (err) {
    console.error("Follow error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.delete("/api/users/:userId/follow", auth, async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    const me = req.user._id.toString();

    if (!ObjectId.isValid(targetUserId)) {
      return res.status(400).json({ message: "Invalid target user id" });
    }

    const deleted = await Follow.findOneAndDelete({
      follower: req.user._id,
      followee: targetUserId,
    });

    if (!deleted) {
      return res.status(400).json({ message: "Not following this user" });
    }

    await User.findByIdAndUpdate(targetUserId, {
      $inc: { followersCount: -1 },
    });
    await User.findByIdAndUpdate(req.user._id, {
      $inc: { followingCount: -1 },
    });

    await cacheHelper.invalidateFollowCaches(me, targetUserId);

    res.json({ message: "Unfollowed successfully", following: false });
  } catch (err) {
    console.error("Unfollow error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/api/users/:userId/following", auth, async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    if (!ObjectId.isValid(targetUserId)) {
      return res.json({ following: false });
    }

    const follow = await Follow.findOne({
      follower: req.user._id,
      followee: targetUserId,
    });

    res.json({ following: !!follow });
  } catch (err) {
    console.error("Check following error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Update profile
app.put("/api/users/me", auth, async (req, res) => {
  try {
    const allowed = ["bio", "avatarUrl", "displayName", "username"];
    const updates = {};

    allowed.forEach((key) => {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    });

    if (updates.username && updates.username !== req.user.username) {
      const existing = await User.findOne({
        username: updates.username,
        _id: { $ne: req.user._id },
      });
      if (existing) {
        return res.status(400).json({ message: "Username already taken" });
      }
    }

    const updated = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    }).select("-passwordHash");

    if (!updated) return res.status(404).json({ message: "User not found" });

    res.json({
      id: updated._id,
      userId: updated.userId,
      username: updated.username,
      displayName: updated.displayName,
      email: updated.email,
      bio: updated.bio,
      avatarUrl: updated.avatarUrl,
      followersCount: updated.followersCount || 0,
      followingCount: updated.followingCount || 0,
    });
  } catch (err) {
    console.error("Update profile error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ======================================================
// =============== MEDIA ROUTES =========================
// ======================================================

app.get("/api/media/all", auth, async (req, res) => {
  try {
    const mediaList = await Media.find({ ownerId: req.user._id })
      .sort({ createdAt: -1 })
      .lean();
    res.json(mediaList);
  } catch (err) {
    console.error("Get media error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/media/upload", auth, async (req, res) => {
  try {
    const { url, mimeType, storageKey } = req.body;
    if (!url || !storageKey) {
      return res.status(400).json({ message: "URL and storageKey required" });
    }

    const newMedia = await Media.create({
      ownerType: "User",
      ownerId: req.user._id,
      url,
      storageKey,
      mimeType: mimeType || "application/octet-stream",
      processed: true,
    });

    res.status(201).json(newMedia);
  } catch (err) {
    console.error("Upload media error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.delete("/api/media/:mediaId", auth, async (req, res) => {
  try {
    const media = await Media.findById(req.params.mediaId);
    if (!media) {
      return res.status(404).json({ message: "Media not found" });
    }
    if (media.ownerId.toString() !== req.user._id.toString()) {
      return res
        .status(403)
        .json({ message: "Not authorized to delete this media" });
    }

    await Media.findByIdAndDelete(req.params.mediaId);
    res.json({ message: "Media deleted successfully" });
  } catch (err) {
    console.error("Delete media error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ======================================================
// =============== POST / FEED ROUTES ===================
// ======================================================

// Create post
app.post("/api/posts", auth, async (req, res) => {
  try {
    const { content, type, mediaUrl } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ message: "Content is required" });
    }

    const user = await User.findById(req.user._id);

    const newPost = await Post.create({
      userId: req.user._id,
      username: req.user.username,
      content,
      type: type || "text",
      mediaUrl: mediaUrl || null,
      likes: [],
      comments: [],
    });

    if (mediaUrl) {
      try {
        await mediaQueue.add("process-media", {
          postId: newPost._id,
          userId: req.user._id,
          filePath: mediaUrl,
          type: type || "text",
        });
      } catch (err) {
        console.warn("Failed to queue media job:", err.message);
      }
    }

    await cacheHelper.invalidateFeedCache();

    if (redisHelpers?.client()) {
      const keys = await redisHelpers
        .client()
        .keys(`user:posts:${req.user._id}:*`);
      if (keys.length) {
        await redisHelpers.client().del(...keys);
      }
    }

    res.status(201).json({
      id: newPost._id,
      username: newPost.username,
      displayName: user.displayName || newPost.username,
      avatar: user.avatarUrl || "👤",
      content: newPost.content,
      mediaUrl: newPost.mediaUrl,
      timestamp: "Just now",
      likes: 0,
      comments: 0,
    });
  } catch (err) {
    console.error("Create post error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Feed
app.get("/api/posts/feed", auth, async (req, res) => {
  try {
    const { cursor } = req.query;
    const limit = 10;

    const cacheKey = cacheHelper.keys.feed(cursor || "first_page");
    const cached = await redisHelpers.getJSON(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const query = {};
    if (cursor) {
      const parsed = new Date(cursor);
      if (!isNaN(parsed)) query.createdAt = { $lt: parsed };
    }

    const posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("userId", "username displayName avatarUrl")
      .lean();

    const formatted = posts.map((post) => {
      const u = post.userId || {};
      return {
        id: post._id,
        username: u.username || post.username,
        displayName: u.displayName || u.username,
        avatar: u.avatarUrl || "👤",
        content: post.content,
        mediaUrl: post.mediaUrl,
        timestamp: formatTimestamp(post.createdAt),
        createdAt: post.createdAt,
        likes: Array.isArray(post.likes) ? post.likes.length : 0,
        commentCount: post.commentCount || 0,
        comments: post.commentCount || 0,
        liked:
          Array.isArray(post.likes) &&
          post.likes.some((id) => id.toString() === req.user._id.toString()),
      };
    });

    const nextCursor =
      formatted.length === limit
        ? formatted[formatted.length - 1].createdAt.toISOString()
        : null;

    const response = {
      posts: formatted.map(({ createdAt, ...rest }) => rest),
      nextCursor,
    };

    await redisHelpers.setJSON(cacheKey, response, { ex: 300 });

    res.json(response);
  } catch (err) {
    console.error("Get feed error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// User posts for profile page
app.get("/api/users/:userId/posts", auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { cursor } = req.query;
    const limit = 12;

    if (!ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const cacheKey = cacheHelper.keys.userPosts(userId, cursor || "first");

    try {
      const cached = await redisHelpers.getJSON(cacheKey);
      if (cached) return res.json(cached);
    } catch (err) {
      console.warn("User posts cache read error:", err.message);
    }

    const query = { userId: new ObjectId(userId) };
    if (cursor) {
      const parsed = new Date(cursor);
      if (!isNaN(parsed)) query.createdAt = { $lt: parsed };
    }

    const posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .select(
        "content mediaUrl likes comments createdAt username displayName avatarUrl"
      )
      .lean();

    const formatted = posts.map((post) => ({
      id: post._id,
      username: post.username,
      displayName: post.displayName,
      avatar: post.avatarUrl || "👤",
      content: post.content,
      mediaUrl: post.mediaUrl,
      thumbnail: post.mediaUrl,
      timestamp: formatTimestamp(post.createdAt),
      createdAt: post.createdAt,
      likes: Array.isArray(post.likes) ? post.likes.length : 0,
      comments: Array.isArray(post.comments) ? post.comments.length : 0,
      liked:
        Array.isArray(post.likes) &&
        post.likes.some((id) => id.toString() === req.user._id.toString()),
    }));

    const nextCursor =
      formatted.length === limit
        ? formatted[formatted.length - 1].createdAt.toISOString()
        : null;

    const response = {
      posts: formatted.map(({ createdAt, ...rest }) => rest),
      nextCursor,
    };

    try {
      await redisHelpers.setJSON(cacheKey, response, { ex: 300 });
    } catch (err) {
      console.warn("User posts cache write error:", err.message);
    }

    res.json(response);
  } catch (err) {
    console.error("Get user posts error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Like / unlike post
app.post("/api/posts/:postId/like", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const idx = post.likes.findIndex(
      (id) => id.toString() === req.user._id.toString()
    );

    if (idx > -1) {
      post.likes.splice(idx, 1);
    } else {
      post.likes.push(req.user._id);

      if (post.userId.toString() !== req.user._id.toString()) {
        await Notification.create({
          user: post.userId,
          actor: req.user._id,
          verb: "like",
          targetType: "Post",
          targetId: post._id,
          read: false,
        });
        await cacheHelper.invalidateNotificationCache(post.userId);
      }
    }

    await post.save();
    await cacheHelper.invalidateFeedCache();

    res.json({
      likes: post.likes.length,
      liked: idx === -1,
    });
  } catch (err) {
    console.error("Like post error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Delete post
app.delete("/api/posts/:postId", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ message: "Post not found" });

    if (post.userId.toString() !== req.user._id.toString()) {
      return res
        .status(403)
        .json({ message: "Not authorized to delete this post" });
    }

    await Post.findByIdAndDelete(req.params.postId);
    await cacheHelper.invalidateFeedCache();

    if (redisHelpers?.client()) {
      await redisHelpers
        .client()
        .del(cacheHelper.keys.userPosts(req.user._id.toString(), "first"));
    }

    res.json({ message: "Post deleted successfully" });
  } catch (err) {
    console.error("Delete post error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ======================================================
// =============== COMMENTS ROUTES ======================
// ======================================================

// Add comment
app.post("/api/posts/:postId/comments", auth, async (req, res) => {
  try {
    const { text, content } = req.body;
    const commentText = (text || content || "").trim();
    if (!commentText) {
      return res.status(400).json({ message: "Comment cannot be empty" });
    }

    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const comment = await Comment.create({
      post: req.params.postId,
      author: req.user._id,
      text: commentText,
    });

    await Post.updateOne(
      { _id: req.params.postId },
      {
        $push: { comments: comment._id },
        $inc: { commentCount: 1 },
      }
    );

    await cacheHelper.invalidateFeedCache();
    if (redisHelpers?.client()) {
      await redisHelpers
        .client()
        .del(cacheHelper.keys.comments(req.params.postId));
    }

    if (post.userId.toString() !== req.user._id.toString()) {
      await Notification.create({
        user: post.userId,
        actor: req.user._id,
        verb: "comment",
        targetType: "Post",
        targetId: post._id,
        read: false,
      });
      await cacheHelper.invalidateNotificationCache(post.userId);
    }

    await comment.populate("author", "username displayName avatarUrl");

    res.status(201).json({
      _id: comment._id,
      id: comment._id,
      text: comment.text,
      content: comment.text,
      author: {
        _id: comment.author._id,
        id: comment.author._id,
        username: comment.author.username,
        displayName: comment.author.displayName || comment.author.username,
        avatarUrl: comment.author.avatarUrl,
      },
      createdAt: comment.createdAt,
    });
  } catch (err) {
    console.error("Post comment error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Get comments
app.get("/api/posts/:postId/comments", async (req, res) => {
  try {
    const cacheKey = cacheHelper.keys.comments(req.params.postId);
    const cached = await redisHelpers.getJSON(cacheKey);
    if (cached) return res.json(cached);

    const comments = await Comment.find({ post: req.params.postId })
      .populate("author", "username displayName avatarUrl")
      .sort({ createdAt: 1 })
      .lean();

    const formatted = comments.map((c) => ({
      _id: c._id,
      id: c._id,
      text: c.text,
      content: c.text,
      author: {
        _id: c.author._id,
        id: c.author._id,
        username: c.author.username,
        displayName: c.author.displayName || c.author.username,
        avatarUrl: c.author.avatarUrl,
      },
      createdAt: c.createdAt,
      likesCount: c.likesCount || 0,
    }));

    await redisHelpers.setJSON(cacheKey, formatted, { ex: 300 });

    res.json(formatted);
  } catch (err) {
    console.error("Get comments error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Delete comment
app.delete("/api/comments/:commentId", auth, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    if (comment.author.toString() !== req.user._id.toString()) {
      const post = await Post.findById(comment.post);
      if (!post || post.userId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: "Not authorized" });
      }
    }

    await Post.updateOne(
      { _id: comment.post },
      {
        $pull: { comments: comment._id },
        $inc: { commentCount: -1 },
      }
    );

    await Comment.findByIdAndDelete(req.params.commentId);

    res.json({ message: "Comment deleted", success: true });
  } catch (err) {
    console.error("Delete comment error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ======================================================
// =============== NOTIFICATION ROUTES ==================
// ======================================================

app.get("/api/notifications", auth, async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user._id })
      .populate("actor", "username displayName avatarUrl")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const formatted = notifications.map((n) => ({
      id: n._id,
      verb: n.verb,
      actor: n.actor
        ? {
            id: n.actor._id,
            username: n.actor.username,
            displayName: n.actor.displayName || n.actor.username,
            avatarUrl: n.actor.avatarUrl,
          }
        : null,
      read: n.read,
      createdAt: n.createdAt,
    }));

    res.json(formatted);
  } catch (err) {
    console.error("Get notifications error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.put("/api/notifications/:notificationId/read", auth, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.notificationId, user: req.user._id },
      { read: true },
      { new: true }
    );
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }
    res.json({ message: "Marked as read", notification });
  } catch (err) {
    console.error("Mark notification read error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/api/notifications/unread/count", auth, async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      user: req.user._id,
      read: false,
    });
    res.json({ count });
  } catch (err) {
    console.error("Get unread count error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ======================================================
// =============== ANALYTICS ROUTES =====================
// ======================================================

app.get("/api/analytics/:period", auth, async (req, res) => {
  try {
    const period = req.params.period;
    const userId = req.user._id;

    const now = new Date();
    let startDate, labels, groupBy;

    if (period === "day") {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      labels = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        labels.push(d.toLocaleDateString("en-US", { weekday: "short" }));
      }
      groupBy = "day";
    } else if (period === "week") {
      startDate = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
      labels = ["Week 1", "Week 2", "Week 3", "Week 4"];
      groupBy = "week";
    } else if (period === "month") {
      startDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
      labels = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        labels.push(d.toLocaleDateString("en-US", { month: "short" }));
      }
      groupBy = "month";
    } else {
      return res.status(400).json({ ok: false, error: "Invalid period" });
    }

    const posts = await Post.find({
      userId,
      createdAt: { $gte: startDate },
    })
      .sort({ createdAt: 1 })
      .lean();

    const likesData = new Array(labels.length).fill(0);

    posts.forEach((post) => {
      const postDate = new Date(post.createdAt);
      const likeCount = post.likes ? post.likes.length : 0;

      let index;
      if (groupBy === "day") {
        const diffDays = Math.floor((now - postDate) / (1000 * 60 * 60 * 24));
        index = 6 - diffDays;
      } else if (groupBy === "week") {
        const diffWeeks = Math.floor(
          (now - postDate) / (1000 * 60 * 60 * 24 * 7)
        );
        index = 3 - diffWeeks;
      } else {
        const diffMonths =
          (now.getFullYear() - postDate.getFullYear()) * 12 +
          (now.getMonth() - postDate.getMonth());
        index = 5 - diffMonths;
      }

      if (index >= 0 && index < labels.length) {
        likesData[index] += likeCount;
      }
    });

    let positive = 0,
      negative = 0,
      neutral = 0;

    posts.forEach((post) => {
      if (!post.content) {
        neutral++;
        return;
      }
      const result = sentimentAnalyzer.analyze(post.content);
      if (result.score > 0) positive++;
      else if (result.score < 0) negative++;
      else neutral++;
    });

    if (!posts.length) {
      positive = negative = neutral = 1;
    }

    let topPost =
      posts.reduce((max, post) => {
        const likes = post.likes ? post.likes.length : 0;
        const maxLikes = max.likes ? max.likes.length : 0;
        return likes > maxLikes ? post : max;
      }, posts[0]) || {};

    if (!topPost.content) topPost = { content: "No posts yet", likes: [] };

    const hashtagCounts = {};
    posts.forEach((post) => {
      const tags = (post.content || "").match(/#\w+/g) || [];
      tags.forEach((t) => {
        hashtagCounts[t] = (hashtagCounts[t] || 0) + 1;
      });
    });

    let trendingHashtag = { tag: "No hashtags yet", count: 0 };
    Object.keys(hashtagCounts).forEach((tag) => {
      if (hashtagCounts[tag] > trendingHashtag.count) {
        trendingHashtag = { tag, count: hashtagCounts[tag] };
      }
    });

    res.json({
      ok: true,
      data: {
        labels,
        likes: likesData,
        sentiment: { positive, negative, neutral },
        topPost: {
          text: topPost.content || "No posts yet",
          likes: topPost.likes ? topPost.likes.length : 0,
        },
        trendingHashtag,
      },
    });
  } catch (err) {
    console.error("Analytics error:", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

// ======================================================
// =============== TRENDING ROUTE (simple) ==============
// ======================================================

app.get("/api/trending", async (req, res) => {
  try {
    const posts = await Post.find().lean();
    const hashtagCounts = {};

    posts.forEach((post) => {
      const tags = (post.content || "").match(/#\w+/g) || [];
      tags.forEach((tag) => {
        hashtagCounts[tag] = (hashtagCounts[tag] || 0) + 1;
      });
    });

    if (!Object.keys(hashtagCounts).length) {
      return res.json({ hashtag: null, posts: [] });
    }

    const [topTag] = Object.entries(hashtagCounts).sort(
      (a, b) => b[1] - a[1]
    )[0];

    const trendingPosts = posts.filter((p) =>
      (p.content || "").includes(topTag)
    );

    res.json({ hashtag: topTag, posts: trendingPosts });
  } catch (err) {
    console.error("Trending route error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ======================================================
// =============== ADMIN ROUTES =========================
// ======================================================

app.get("/api/admin/info", auth, adminAuth, (req, res) => {
  res.json({ username: req.user.username });
});

app.get("/api/admin/logs", auth, adminAuth, async (req, res) => {
  try {
    const { eventType, username } = req.query;

    const must = [];
    if (eventType) must.push({ match_phrase: { eventType } });
    if (username) must.push({ match_phrase: { username } });

    const esQuery = must.length ? { bool: { must } } : { match_all: {} };

    try {
      const result = await esClient.search({
        index: "socialsync-logs-*",
        body: {
          query: esQuery,
          sort: [{ timestamp: { order: "desc" } }],
          size: 100,
        },
      });

      const hits = result?.body?.hits?.hits || result?.hits?.hits || [];
      const logs = hits.map((h) => h._source || h);

      res.json({ logs });
    } catch (err) {
      console.error("Elasticsearch error:", err.message);
      res.json({
        logs: [],
        error: "Elasticsearch error",
        details: err.message,
      });
    }
  } catch (err) {
    console.error("Admin logs error:", err);
    res.status(500).json({ error: "Failed to fetch logs" });
  }
});

app.get("/api/admin/test-log", auth, adminAuth, async (req, res) => {
  try {
    res.json({
      message:
        "Test log sent. Check Logstash/Elasticsearch from your infra (docker logs etc.)",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/stats", auth, adminAuth, async (req, res) => {
  try {
    try {
      const result = await esClient.search({
        index: "socialsync-logs-*",
        body: {
          aggs: {
            by_event: {
              terms: {
                field: "eventType.keyword",
                size: 20,
              },
            },
            logins: {
              filter: {
                term: { "eventType.keyword": "LOGIN" },
              },
            },
          },
          size: 0,
        },
      });

      const totalUsers = await User.countDocuments();
      const totalPosts = await Post.countDocuments();
      const aggs = result?.body?.aggregations || result?.aggregations || {};

      res.json({
        totalLogins: aggs.logins?.doc_count || 0,
        totalUsers,
        totalPosts,
        postsToday: 0,
        totalEngagement: 0,
        highPriorityEvents: 0,
        topEvents: (aggs.by_event?.buckets || []).map((b) => ({
          eventType: b.key,
          count: b.doc_count,
        })),
      });
    } catch (err) {
      console.error("ES stats error:", err.message);
      const totalUsers = await User.countDocuments();
      const totalPosts = await Post.countDocuments();
      res.json({
        totalLogins: 0,
        totalUsers,
        totalPosts,
        postsToday: 0,
        totalEngagement: 0,
        highPriorityEvents: 0,
        topEvents: [],
      });
    }
  } catch (err) {
    console.error("Admin stats error:", err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

app.get("/api/admin/users", auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find()
      .select("username displayName followersCount followingCount createdAt")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const usersWithPosts = await Promise.all(
      users.map(async (u) => {
        const postsCount = await Post.countDocuments({ userId: u._id });
        return {
          _id: u._id,
          username: u.username,
          displayName: u.displayName || u.username,
          followersCount: u.followersCount || 0,
          followingCount: u.followingCount || 0,
          postsCount,
          createdAt: u.createdAt,
        };
      })
    );

    res.json({ users: usersWithPosts });
  } catch (err) {
    console.error("Admin users error:", err);
    res
      .status(500)
      .json({ error: "Failed to fetch users", details: err.message });
  }
});

// ======================================================
// =============== MESSAGES REST (for new frontend) =====
// ======================================================

// Total unread count (badge)
app.get("/api/messages/unread/count", auth, async (req, res) => {
  try {
    const count = await Message.countDocuments({
      recipients: req.user._id,
      sender: { $ne: req.user._id },
      readBy: { $ne: req.user._id },
    });
    res.json({ count });
  } catch (err) {
    console.error("Unread messages count error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ---- NEW: /conversations (used by frontend messages.js) ----
app.get("/conversations", auth, async (req, res) => {
  try {
    const messages = await Message.find({
      $or: [{ sender: req.user._id }, { recipients: req.user._id }],
    })
      .populate("sender", "username displayName avatarUrl")
      .populate("recipients", "username displayName avatarUrl")
      .sort({ createdAt: -1 })
      .lean();

    const map = new Map();

    for (const msg of messages) {
      const convId = msg.conversationId;
      if (!convId) continue;

      if (!map.has(convId)) {
        const isMine = msg.sender._id.toString() === req.user._id.toString();
        const otherUser = isMine ? msg.recipients[0] : msg.sender;

        map.set(convId, {
          conversationId: convId,
          with: {
            id: otherUser._id,
            username: otherUser.username,
            displayName: otherUser.displayName || otherUser.username,
            avatarUrl: otherUser.avatarUrl || null,
          },
          lastMessage: {
            text: msg.text,
            createdAt: msg.createdAt,
            senderId: msg.sender._id,
          },
          unreadCount: 0,
        });
      }
    }

    // unread counts per conversation
    for (const [convId, conv] of map) {
      const unread = await Message.countDocuments({
        conversationId: convId,
        sender: { $ne: req.user._id },
        readBy: { $ne: req.user._id },
      });
      conv.unreadCount = unread;
    }

    const conversations = Array.from(map.values());
    res.json({ conversations });
  } catch (err) {
    console.error("/conversations error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ---- NEW: /conversations/user/:username ----
app.get("/conversations/user/:username", auth, async (req, res) => {
  try {
    const username = req.params.username;
    const otherUser = await User.findOne({ username });
    if (!otherUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const otherId = otherUser._id.toString();
    const myId = req.user._id.toString();
    const conversationId = [myId, otherId].sort().join("_");

    const messages = await Message.find({ conversationId })
      .populate("sender", "username displayName avatarUrl")
      .sort({ createdAt: 1 })
      .lean();

    const formatted = messages.map((m) => ({
      _id: m._id,
      id: m._id,
      sender: {
        id: m.sender._id,
        username: m.sender.username,
        displayName: m.sender.displayName || m.sender.username,
        avatarUrl: m.sender.avatarUrl || null,
      },
      text: m.text,
      createdAt: m.createdAt,
    }));

    // mark messages as read for me
    await Message.updateMany(
      {
        conversationId,
        sender: otherId,
        readBy: { $ne: myId },
      },
      { $addToSet: { readBy: myId } }
    );

    res.json({
      with: {
        id: otherUser._id,
        username: otherUser.username,
        displayName: otherUser.displayName || otherUser.username,
        avatarUrl: otherUser.avatarUrl || null,
      },
      messages: formatted,
    });
  } catch (err) {
    console.error("/conversations/user/:username error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ---- NEW: POST /conversations/user/:username/messages ----
app.post("/conversations/user/:username/messages", auth, async (req, res) => {
  try {
    const username = req.params.username;
    const { text } = req.body;
    const trimmed = (text || "").trim();
    if (!trimmed) {
      return res.status(400).json({ message: "Text is required" });
    }

    const toUser = await User.findOne({ username });
    if (!toUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const fromId = req.user._id.toString();
    const toId = toUser._id.toString();
    const conversationId = [fromId, toId].sort().join("_");

    const newMessage = await Message.create({
      conversationId,
      sender: fromId,
      recipients: [toId],
      text: trimmed,
      deliveredTo: [],
      readBy: [],
    });

    const populated = await Message.findById(newMessage._id)
      .populate("sender", "username displayName avatarUrl")
      .lean();

    const payload = {
      id: populated._id,
      conversationId,
      sender: {
        id: populated.sender._id,
        username: populated.sender.username,
        displayName: populated.sender.displayName || populated.sender.username,
        avatarUrl: populated.sender.avatarUrl || null,
      },
      text: populated.text,
      createdAt: populated.createdAt,
      delivered: false,
      read: false,
    };

    // emit via socket if receiver is online
    const receiverSocketId = connectedUsers.get(toId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("new_message", payload);
    }

    res.status(201).json(payload);
  } catch (err) {
    console.error("POST /conversations/user/:username/messages error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ======================================================
// =============== SERVER START =========================
// ======================================================

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";

server.listen(PORT, HOST, () => {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }

  console.log(`✅ Server + Socket.IO running on port ${PORT}`);
  console.log(`📍 Local:  http://localhost:${PORT}`);
  if (addresses.length) {
    console.log(`📍 LAN:    http://${addresses[0]}:${PORT}`);
  }
});
