// ===== SOCIALSYNC SERVER - OPTIMIZED SINGLE FILE ARCHITECTURE =====
require("dotenv").config();

// ============= GLOBAL ERROR HANDLERS =============
process.on("unhandledRejection", (reason, promise) => {
  const message = reason?.message || String(reason);
  // Suppress repeated Redis timeout errors
  if (!message.includes("ETIMEDOUT")) {
    console.error("⚠️ Unhandled rejection:", message);
  }
});

process.on("uncaughtException", (error) => {
  // Suppress repeated Redis timeout errors
  if (!error.message.includes("ETIMEDOUT")) {
    console.error("⚠️ Uncaught exception:", error.message);
  }
});

// ============= CONFIG & CONSTANTS =============
const requiredEnvVars = ["JWT_SECRET", "MONGODB_URI", "PORT"];
const missingVars = requiredEnvVars.filter((v) => !process.env[v]);
if (missingVars.length > 0) {
  console.error("❌ Missing env vars:", missingVars.join(", "));
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 32) {
  console.error("❌ JWT_SECRET must be 32+ characters");
  process.exit(1);
}

// Get current deployment URL for CORS
const DEPLOYMENT_URL = (() => {
  if (process.env.NODE_ENV === 'production') {
    // On Render, use the service URL
    return process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL || '*';
  }
  return 'http://localhost:3000';
})();

// Rate limits
const RATE_LIMITS = {
  auth: { windowMs: 15 * 60 * 1000, max: 5 },
  api: { windowMs: 60 * 1000, max: 100 },
};

// Cache TTLs (seconds)
const CACHE_TTL = {
  search: 600,
  feed: 300,
  userPosts: 300,
  comments: 300,
};

// Content limits
const LIMITS = {
  messageLength: 5000,
  postContent: 5000,
  commentLength: 2000,
  ageMin: 16,
  ageMax: 120,
};

const VALID_GENDERS = ["male", "female", "other", "prefer-not-to-say"];
const ADMIN_USERNAMES = process.env.ADMIN_USERNAMES?.split(",").map((u) => u.trim()) || [];

// Imports
const path = require("path");
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const Sentiment = require("sentiment");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const http = require("http");
const os = require("os");
const { Client } = require("@elastic/elasticsearch");

// Models & middleware
const User = require("./models/User");
const Post = require("./models/Post");
const Follow = require("./models/Follow");
const auth = require("./middleware/auth");
const adminAuth = require("./middleware/adminAuth");

// Services
const connectDB = require("./db");
const { redisHelpers } = require("./db");
const logger = require("./services/logger");
const mediaQueue = require("./queues/media.queue");

// Routers
const notificationsRouter = require("./routes/notifications");
const messagesRouter = require("./routes/messages");
const trendingRouter = require("./routes/trending");
const logDemoRoutes = require("./routes/logDemo");

// Clients
const esClient = new Client({ node: "http://localhost:9200" });
const sentimentAnalyzer = new Sentiment();

// ============= APP SETUP =============
const app = express();
const server = http.createServer(app);

// Middleware
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static(path.join(__dirname, "..", "frontend")));

// CORS
app.use((req, res, next) => {
  const origin = req.headers.origin || "*";
  res.header("Access-Control-Allow-Origin", origin);
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.set("trust proxy", 1);
app.use("/api/", rateLimit(RATE_LIMITS.api));

// External routers
app.use("/api/notifications", notificationsRouter);
app.use("/api/trending", trendingRouter);
app.use("/api", messagesRouter);
app.use("/api/conversations", auth, messagesRouter);
app.use("/demo", logDemoRoutes);
app.get("/", (req, res) => res.redirect("/login.html"));

// ============= DATABASE & SOCKET.IO =============
connectDB();
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? [DEPLOYMENT_URL] : "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const connectedUsers = new Map();

// ============= HELPER FUNCTIONS =============

// Logging helpers
async function logEvent(req, eventType, description, metadata = {}) {
  try {
    await logger.logFromRequest(req, { eventType, description, metadata });
  } catch (err) {
    console.warn("⚠️ Log error:", err.message);
  }
}

async function logSocketEvent(socket, eventType, description, metadata = {}) {
  const mockReq = {
    user: { _id: socket.userId, username: socket.username },
    ip: socket.handshake.address,
    headers: socket.handshake.headers,
  };
  await logEvent(mockReq, eventType, description, metadata);
}

// JWT helpers
function verifyToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

function signToken(userId, username) {
  return jwt.sign(
    { sub: userId.toString(), username },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// Response helpers
const sendError = (res, status, message) => res.status(status).json({ message });
const sendSuccess = (res, data, status = 200) => res.status(status).json(data);

// Formatting
function formatTimestamp(date) {
  const now = new Date();
  const diff = Math.floor((now - new Date(date)) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(date).toLocaleDateString();
}

// Message formatting
function formatMessage(msg) {
  return {
    id: msg._id,
    conversationId: msg.conversationId,
    sender: {
      id: msg.sender._id,
      username: msg.sender.username,
      displayName: msg.sender.displayName || msg.sender.username,
      avatarUrl: msg.sender.avatarUrl,
    },
    text: msg.text,
    createdAt: msg.createdAt,
    delivered: msg.deliveredTo?.length > 0,
    read: msg.readBy?.length > 0,
  };
}

// Cache helpers
const cacheHelper = {
  keys: {
    search: (q) => `search:users:${q.toLowerCase()}`,
    feed: (cursor) => `feed:posts:${cursor || "latest"}`,
    userPosts: (userId, cursor) => `user:posts:${userId}:${cursor || "latest"}`,
    comments: (postId) => `post:comments:${postId}`,
  },
  invalidateFeed: async () => {
    if (!redisHelpers?.client()) return;
    try {
      const keys = await redisHelpers.client().keys("feed:posts:*");
      if (keys?.length) await redisHelpers.client().del(...keys);
    } catch (e) {
      console.warn("⚠️ Cache error:", e.message);
    }
  },
  invalidateFollowCaches: async (followerId, followeeId) => {
    if (!redisHelpers?.client()) return;
    try {
      await redisHelpers.client().del(
        `follow:${followerId}:${followeeId}`,
        `user:followers:${followeeId}`,
        `user:following:${followerId}`
      );
    } catch (e) {
      console.warn("⚠️ Cache error:", e.message);
    }
  },
  invalidateNotifications: async (userId) => {
    if (!redisHelpers?.client()) return;
    try {
      await redisHelpers.client().del(`notif:unread:${userId}`);
    } catch (e) {
      console.warn("⚠️ Cache error:", e.message);
    }
  },
};

// ============= SOCKET.IO SETUP =============

// Authentication
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("Auth error"));
  
  const decoded = verifyToken(token);
  if (!decoded) return next(new Error("Auth error"));
  
  socket.userId = decoded.sub;
  socket.username = decoded.username;
  next();
});

// Connections
io.on("connection", (socket) => {
  console.log("✅ User connected:", socket.username);
  connectedUsers.set(socket.userId, socket.id);
  socket.broadcast.emit("user_online", { userId: socket.userId, username: socket.username });
  io.emit("online_users", Array.from(connectedUsers.keys()));
  socket.join(socket.userId);

  // Typing
  socket.on("typing", (data) => {
    const recipientId = connectedUsers.get(data.recipientId);
    if (recipientId) {
      io.to(recipientId).emit("user_typing", {
        userId: socket.userId,
        username: socket.username,
        isTyping: data.isTyping,
      });
    }
  });

  // Send message
  socket.on("send_message", async (data) => {
    try {
      if (!data.recipientId || !data.text) {
        return socket.emit("message_error", { error: "Invalid data" });
      }
      if (data.text.length > LIMITS.messageLength) {
        return socket.emit("message_error", { error: "Message too long" });
      }

      const Message = require("./models/Message");
      const convId = [socket.userId, data.recipientId].sort().join("_");

      const newMsg = await Message.create({
        conversationId: convId,
        sender: socket.userId,
        recipients: [data.recipientId],
        text: data.text,
        deliveredTo: [],
        readBy: [],
      });

      await logSocketEvent(socket, "MESSAGE_SENT", "User sent a message", {
        recipientId: data.recipientId,
        messageId: newMsg._id,
      });

      const populated = await Message.findById(newMsg._id)
        .populate("sender", "username displayName avatarUrl")
        .lean();

      const msgData = formatMessage(populated);
      socket.emit("message_sent", msgData);

      const recipientSocketId = connectedUsers.get(data.recipientId);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit("new_message", msgData);
        await Message.findByIdAndUpdate(newMsg._id, {
          $addToSet: { deliveredTo: data.recipientId },
        });
        socket.emit("message_delivered", { messageId: newMsg._id });
        await logSocketEvent(socket, "MESSAGE_DELIVERED", "Message delivered", {
          recipientId: data.recipientId,
          messageId: newMsg._id,
        });
      }
    } catch (error) {
      console.error("❌ Send message error:", error);
      socket.emit("message_error", { error: "Send failed" });
    }
  });

  // Mark read
  socket.on("mark_read", async (data) => {
    try {
      const Message = require("./models/Message");
      const result = await Message.updateMany(
        {
          conversationId: data.conversationId,
          sender: data.senderId,
          readBy: { $ne: socket.userId },
        },
        { $addToSet: { readBy: socket.userId } }
      );

      if (result.modifiedCount > 0) {
        await logSocketEvent(
          socket,
          "MESSAGE_READ",
          "User read messages",
          { conversationId: data.conversationId }
        );
        const senderSocketId = connectedUsers.get(data.senderId);
        if (senderSocketId) {
          io.to(senderSocketId).emit("messages_read", {
            conversationId: data.conversationId,
            readBy: socket.userId,
          });
        }
      }
    } catch (error) {
      console.error("❌ Mark read error:", error);
    }
  });

  socket.on("error", (error) => console.error("❌ Socket error:", error));

  socket.on("disconnect", () => {
    connectedUsers.delete(socket.userId);
    socket.broadcast.emit("user_offline", { userId: socket.userId });
    io.emit("online_users", Array.from(connectedUsers.keys()));
  });
});

// ============= MESSAGE ROUTES =============

app.get("/api/messages/conversations", auth, async (req, res) => {
  try {
    const Message = require("./models/Message");
    const messages = await Message.find({
      $or: [{ sender: req.user._id }, { recipients: req.user._id }],
    })
      .populate("sender", "username displayName avatarUrl")
      .populate("recipients", "username displayName avatarUrl")
      .sort({ createdAt: -1 })
      .lean();

    const convMap = new Map();
    messages.forEach((msg) => {
      if (convMap.has(msg.conversationId)) return;
      const otherUser =
        msg.sender._id.toString() === req.user._id.toString()
          ? msg.recipients[0]
          : msg.sender;
      convMap.set(msg.conversationId, {
        conversationId: msg.conversationId,
        otherUser: {
          id: otherUser._id,
          username: otherUser.username,
          displayName: otherUser.displayName || otherUser.username,
          avatarUrl: otherUser.avatarUrl,
        },
        lastMessage: {
          text: msg.text,
          createdAt: msg.createdAt,
          senderId: msg.sender._id,
          read: msg.readBy.includes(req.user._id),
        },
        unreadCount: 0,
      });
    });

    // Count unread
    for (const [convId, conv] of convMap) {
      const count = await Message.countDocuments({
        conversationId: convId,
        sender: { $ne: req.user._id },
        readBy: { $ne: req.user._id },
      });
      conv.unreadCount = count;
    }

    sendSuccess(res, Array.from(convMap.values()));
  } catch (error) {
    console.error("❌ Conversations error:", error);
    sendError(res, 500, "Server error");
  }
});

app.get("/api/messages/conversation/:userId", auth, async (req, res) => {
  try {
    const Message = require("./models/Message");
    const convId = [req.user._id.toString(), req.params.userId].sort().join("_");

    const messages = await Message.find({ conversationId: convId })
      .populate("sender", "username displayName avatarUrl")
      .sort({ createdAt: 1 })
      .lean();

    const formatted = messages.map((msg) => ({
      id: msg._id,
      sender: {
        id: msg.sender._id,
        username: msg.sender.username,
        displayName: msg.sender.displayName || msg.sender.username,
        avatarUrl: msg.sender.avatarUrl,
      },
      text: msg.text,
      createdAt: msg.createdAt,
      delivered: msg.deliveredTo.length > 0,
      read: msg.readBy.length > 0,
      isMine: msg.sender._id.toString() === req.user._id.toString(),
    }));

    sendSuccess(res, formatted);
  } catch (error) {
    console.error("❌ Messages error:", error);
    sendError(res, 500, "Server error");
  }
});

app.get("/api/messages/unread/count", auth, async (req, res) => {
  try {
    const Message = require("./models/Message");
    const count = await Message.countDocuments({
      recipients: req.user._id,
      sender: { $ne: req.user._id },
      readBy: { $ne: req.user._id },
    });
    sendSuccess(res, { count });
  } catch (error) {
    console.error("❌ Unread count error:", error);
    sendError(res, 500, "Server error");
  }
});

// ============= AUTH ROUTES =============

const authLimiter = rateLimit(RATE_LIMITS.auth);

app.post("/api/auth/signup", authLimiter, async (req, res) => {
  try {
    const { email, username, age, gender, password } = req.body;

    if (!email || !username || !age || !gender || !password) {
      return sendError(res, 400, "All fields required");
    }
    if (!/^[a-zA-Z]/.test(username)) {
      return sendError(res, 400, "Username must start with a letter");
    }
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(username)) {
      return sendError(res, 400, "Username format invalid");
    }

    const ageNum = parseInt(age);
    if (isNaN(ageNum) || ageNum < LIMITS.ageMin || ageNum > LIMITS.ageMax) {
      return sendError(res, 400, `Age must be ${LIMITS.ageMin}-${LIMITS.ageMax}`);
    }
    if (!VALID_GENDERS.includes(gender)) {
      return sendError(res, 400, "Invalid gender");
    }
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      return sendError(res, 400, "No special chars in password");
    }
    if (password.length < 6) {
      return sendError(res, 400, "Password must be 6+ chars");
    }

    if (await User.findOne({ email })) {
      return sendError(res, 400, "Email already registered");
    }
    if (await User.findOne({ username })) {
      return sendError(res, 400, "Username taken");
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

    await logEvent(req, "SIGNUP", "User signed up", {
      userId: newUser._id,
      username: newUser.username,
    });

    const token = signToken(newUser._id, newUser.username);
    sendSuccess(res, {
      id: newUser._id,
      userId: newUser._id.toString(),
      email: newUser.email,
      username: newUser.username,
      age: newUser.age,
      gender: newUser.gender,
      token,
    }, 201);
  } catch (err) {
    console.error("❌ Signup error:", err);
    sendError(res, 500, "Server error");
  }
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return sendError(res, 400, "Username and password required");
    }

    const user = await User.findOne({ username });
    if (!user) {
      return sendError(res, 404, "Account not found");
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return sendError(res, 401, "Incorrect password");
    }

    const token = signToken(user._id, user.username);
    const isAdmin = ADMIN_USERNAMES.includes(username);

    await logEvent(req, "LOGIN", "User logged in", {
      userId: user._id,
      username: user.username,
      isAdmin,
    });

    sendSuccess(res, {
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
    console.error("❌ Login error:", err);
    sendError(res, 500, "Server error");
  }
});

app.post("/api/auth/logout", auth, async (req, res) => {
  try {
    await logEvent(req, "LOGOUT", "User logged out", {
      userId: req.user._id,
      username: req.user.username,
    });
    sendSuccess(res, { message: "Logged out" });
  } catch (err) {
    console.error("❌ Logout error:", err);
    sendError(res, 500, "Server error");
  }
});

// ============= USER ROUTES =============

app.get("/api/users/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-passwordHash");
    if (!user) return sendError(res, 404, "User not found");

    sendSuccess(res, {
      id: user._id,
      username: user.username,
      displayName: user.displayName || user.username,
      email: user.email,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      followersCount: user.followersCount || 0,
      followingCount: user.followingCount || 0,
    });
  } catch (err) {
    console.error("❌ Get user error:", err);
    sendError(res, 500, "Server error");
  }
});

app.get("/api/users/search", auth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim() === "") return sendSuccess(res, []);

    const cacheKey = cacheHelper.keys.search(q);
    const cached = await redisHelpers.getJSON(cacheKey);
    if (cached) {
      console.log("✅ Search cache hit");
      return sendSuccess(res, cached);
    }

    await logEvent(req, "USER_SEARCH", "User performed search", { query: q });

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
      avatarUrl: u.avatarUrl,
      followersCount: u.followersCount || 0,
    }));

    try {
      const size = JSON.stringify(result).length;
      if (size < 5242880) { // Only cache if under 5MB
        await redisHelpers.setJSON(cacheKey, result, { ex: CACHE_TTL.search });
      }
    } catch (cacheErr) {
      console.warn("⚠️ Redis cache error:", cacheErr.message);
    }
    sendSuccess(res, result);
  } catch (err) {
    console.error("❌ Search error:", err);
    sendError(res, 500, "Server error");
  }
});

app.get("/api/users/:id/followers", async (req, res) => {
  try {
    const followDocs = await Follow.find({ followee: req.params.id }).populate(
      "follower",
      "username name avatarUrl"
    );

    if (!followDocs?.length) return sendSuccess(res, []);

    const userIds = followDocs
      .map((f) => f.follower?._id)
      .filter(Boolean)
      .map((id) => id.toString());

    const counts = await Follow.aggregate([
      {
        $match: {
          followee: { $in: userIds.map((id) => new mongoose.Types.ObjectId(id)) },
        },
      },
      { $group: { _id: "$followee", count: { $sum: 1 } } },
    ]);

    const countMap = counts.reduce((m, c) => {
      m[c._id.toString()] = c.count;
      return m;
    }, {});

    const followers = followDocs.map((f) => ({
      id: f.follower._id,
      username: f.follower.username,
      name: f.follower.name,
      avatarUrl: f.follower.avatarUrl || null,
      followerCount: countMap[f.follower._id.toString()] || 0,
    }));

    sendSuccess(res, followers);
  } catch (err) {
    console.error("❌ Followers error:", err);
    sendError(res, 500, "Server error");
  }
});

app.get("/api/users/:id/following-list", async (req, res) => {
  try {
    const followDocs = await Follow.find({ follower: req.params.id }).populate(
      "followee",
      "username name avatarUrl"
    );

    if (!followDocs?.length) return sendSuccess(res, []);

    const userIds = followDocs
      .map((f) => f.followee?._id)
      .filter(Boolean)
      .map((id) => id.toString());

    const counts = await Follow.aggregate([
      {
        $match: {
          followee: { $in: userIds.map((id) => new mongoose.Types.ObjectId(id)) },
        },
      },
      { $group: { _id: "$followee", count: { $sum: 1 } } },
    ]);

    const countMap = counts.reduce((m, c) => {
      m[c._id.toString()] = c.count;
      return m;
    }, {});

    const following = followDocs.map((f) => ({
      id: f.followee._id,
      username: f.followee.username,
      name: f.followee.name,
      avatarUrl: f.followee.avatarUrl || null,
      followerCount: countMap[f.followee._id.toString()] || 0,
    }));

    sendSuccess(res, following);
  } catch (err) {
    console.error("❌ Following error:", err);
    sendError(res, 500, "Server error");
  }
});

app.post("/api/users/:userId/follow", auth, async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.startTransaction();

    const targetId = req.params.userId;
    const me = req.user._id.toString();

    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      await session.abortTransaction();
      return sendError(res, 400, "Invalid user ID");
    }
    if (me === targetId) {
      await session.abortTransaction();
      return sendError(res, 400, "Cannot follow yourself");
    }

    const targetUser = await User.findById(targetId).session(session);
    if (!targetUser) {
      await session.abortTransaction();
      return sendError(res, 404, "User not found");
    }

    const existing = await Follow.findOne({
      follower: req.user._id,
      followee: targetId,
    }).session(session);

    if (existing) {
      await session.abortTransaction();
      return sendError(res, 400, "Already following");
    }

    await Follow.create(
      [{ follower: req.user._id, followee: targetId, status: "accepted" }],
      { session }
    );

    await User.findByIdAndUpdate(
      targetId,
      { $inc: { followersCount: 1 } },
      { session }
    );
    await User.findByIdAndUpdate(
      req.user._id,
      { $inc: { followingCount: 1 } },
      { session }
    );

    await session.commitTransaction();

    await logEvent(req, "USER_FOLLOWS", "User followed another user", {
      target: targetId,
    });

    await cacheHelper.invalidateFollowCaches(me, targetId);

    try {
      const Notification = require("./models/Notification");
      await Notification.create({
        user: targetId,
        actor: req.user._id,
        verb: "follow",
        targetType: "User",
        targetId: req.user._id,
        read: false,
      });
    } catch (nerr) {
      console.warn("⚠️ Notification error:", nerr.message);
    }

    sendSuccess(res, { message: "Followed", following: true });
  } catch (err) {
    await session.abortTransaction();
    console.error("❌ Follow error:", err);
    sendError(res, 500, "Server error");
  } finally {
    session.endSession();
  }
});

app.delete("/api/users/:userId/follow", auth, async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.startTransaction();

    const targetId = req.params.userId;
    const me = req.user._id.toString();

    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      await session.abortTransaction();
      return sendError(res, 400, "Invalid user ID");
    }

    const deleted = await Follow.findOneAndDelete({
      follower: req.user._id,
      followee: targetId,
    }).session(session);

    if (!deleted) {
      await session.abortTransaction();
      return sendError(res, 400, "Not following this user");
    }

    await User.findByIdAndUpdate(
      targetId,
      { $inc: { followersCount: -1 } },
      { session }
    );
    await User.findByIdAndUpdate(
      req.user._id,
      { $inc: { followingCount: -1 } },
      { session }
    );

    await session.commitTransaction();

    await logEvent(req, "USER_UNFOLLOWS", "User unfollowed another user", {
      target: targetId,
    });

    await cacheHelper.invalidateFollowCaches(me, targetId);

    sendSuccess(res, { message: "Unfollowed", following: false });
  } catch (err) {
    await session.abortTransaction();
    console.error("❌ Unfollow error:", err);
    sendError(res, 500, "Server error");
  } finally {
    session.endSession();
  }
});

app.get("/api/users/:userId/following", auth, async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return sendSuccess(res, { following: false });
    }

    const follow = await Follow.findOne({
      follower: req.user._id,
      followee: userId,
    });

    sendSuccess(res, { following: !!follow });
  } catch (err) {
    console.error("❌ Check following error:", err);
    sendError(res, 500, "Server error");
  }
});

app.put("/api/users/me", auth, async (req, res) => {
  try {
    const allowed = ["bio", "avatarUrl", "displayName", "username"];
    const updates = {};
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    });

    if (updates.username && updates.username !== req.user.username) {
      const exists = await User.findOne({
        username: updates.username,
        _id: { $ne: req.user._id },
      });
      if (exists) return sendError(res, 400, "Username taken");
    }

    const updated = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    }).select("-passwordHash");

    if (!updated) return sendError(res, 404, "User not found");

    await logEvent(req, "PROFILE_UPDATED", "User updated profile", { updates });

    sendSuccess(res, {
      id: updated._id,
      username: updated.username,
      displayName: updated.displayName,
      email: updated.email,
      bio: updated.bio,
      avatarUrl: updated.avatarUrl,
      followersCount: updated.followersCount || 0,
      followingCount: updated.followingCount || 0,
    });
  } catch (err) {
    console.error("❌ Update profile error:", err);
    sendError(res, 500, "Server error");
  }
});

// ============= MEDIA ROUTES =============

app.get("/api/media/all", auth, async (req, res) => {
  try {
    const Media = require("./models/Media");
    const mediaList = await Media.find({ ownerId: req.user._id })
      .sort({ createdAt: -1 })
      .lean();
    sendSuccess(res, mediaList);
  } catch (err) {
    console.error("❌ Media list error:", err);
    sendError(res, 500, "Server error");
  }
});

app.post("/api/media/upload", auth, async (req, res) => {
  try {
    const Media = require("./models/Media");
    const { url, mimeType, storageKey } = req.body;

    if (!url || !storageKey) {
      return sendError(res, 400, "URL and storageKey required");
    }

    const newMedia = await Media.create({
      ownerType: "User",
      ownerId: req.user._id,
      url,
      storageKey,
      mimeType: mimeType || "application/octet-stream",
      processed: true,
    });

    await logEvent(req, "MEDIA_UPLOADED", "User uploaded media", {
      mediaId: newMedia._id,
    });

    sendSuccess(res, newMedia, 201);
  } catch (err) {
    console.error("❌ Upload error:", err);
    sendError(res, 500, "Server error");
  }
});

app.delete("/api/media/:mediaId", auth, async (req, res) => {
  try {
    const Media = require("./models/Media");
    const media = await Media.findById(req.params.mediaId);

    if (!media) return sendError(res, 404, "Media not found");
    if (media.ownerId.toString() !== req.user._id.toString()) {
      return sendError(res, 403, "Not authorized");
    }

    await logEvent(req, "MEDIA_DELETED", "User deleted media", {
      mediaId: req.params.mediaId,
    });

    await Media.findByIdAndDelete(req.params.mediaId);
    sendSuccess(res, { message: "Deleted" });
  } catch (err) {
    console.error("❌ Delete media error:", err);
    sendError(res, 500, "Server error");
  }
});

// ============= POST/FEED ROUTES =============

app.post("/api/posts", auth, async (req, res) => {
  try {
    const { content, type, mediaUrl } = req.body;

    if (!content || content.trim() === "") {
      return sendError(res, 400, "Content required");
    }
    if (content.length > LIMITS.postContent) {
      return sendError(res, 400, "Content too long");
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

    await logEvent(req, "POST_CREATED", "User created post", {
      postId: newPost._id,
      hasMedia: !!mediaUrl,
    });

    if (mediaUrl) {
      try {
        await mediaQueue.add("process-media", {
          postId: newPost._id,
          userId: req.user._id,
          filePath: mediaUrl,
          type: type || "text",
        });
      } catch (queueErr) {
        console.warn("⚠️ Queue error:", queueErr.message);
      }
    }

    await cacheHelper.invalidateFeed();

    sendSuccess(res, {
      id: newPost._id,
      username: newPost.username,
      displayName: user.displayName || newPost.username,
      avatar: user.avatarUrl || "👤",
      content: newPost.content,
      mediaUrl: newPost.mediaUrl,
      timestamp: "Just now",
      likes: 0,
      comments: 0,
    }, 201);
  } catch (err) {
    console.error("❌ Post error:", err);
    sendError(res, 500, "Server error");
  }
});

app.get("/api/posts/feed", auth, async (req, res) => {
  try {
    const { cursor } = req.query;
    const limit = 10;
    const cacheKey = cacheHelper.keys.feed(cursor || "first_page");

    try {
      const cached = await redisHelpers.getJSON(cacheKey);
      if (cached) {
        console.log("✅ Feed cache hit");
        return sendSuccess(res, cached);
      }
    } catch (cacheErr) {
      console.warn("⚠️ Redis cache read error (continuing without cache):", cacheErr.message);
      // Continue without cache - don't fail
    }

    const query = {};
    if (cursor) {
      const parsedCursor = new Date(cursor);
      if (!isNaN(parsedCursor)) {
        query.createdAt = { $lt: parsedCursor };
      }
    }

    const posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("userId", "username displayName avatarUrl")
      .lean();

    const formatted = posts.map((post) => {
      const postUser = post.userId || {};
      return {
        id: post._id,
        username: postUser.username || post.username,
        displayName: postUser.displayName || postUser.username,
        avatar: postUser.avatarUrl || "👤",
        content: post.content,
        mediaUrl: post.mediaUrl,
        timestamp: formatTimestamp(post.createdAt),
        createdAt: post.createdAt,
        likes: Array.isArray(post.likes) ? post.likes.length : 0,
        commentCount: post.commentCount || 0,
        liked:
          Array.isArray(post.likes) &&
          post.likes.some((id) => id.toString() === req.user._id.toString()),
      };
    });

    const nextCursor =
      formatted.length === limit ? formatted[formatted.length - 1].createdAt.toISOString() : null;

    const response = {
      posts: formatted.map(({ createdAt, ...rest }) => rest),
      nextCursor,
    };

    // Try to cache, but catch size errors (common on free Redis tiers)
    try {
      const size = JSON.stringify(response).length;
      if (size < 5242880) { // Only cache if under 5MB
        await redisHelpers.setJSON(cacheKey, response, { ex: CACHE_TTL.feed });
        console.log(`📦 Feed cached: ${(size / 1024).toFixed(2)}KB`);
      } else {
        console.warn(`⚠️ Feed response too large (${(size / 1024).toFixed(2)}KB) - skipping cache`);
      }
    } catch (cacheErr) {
      console.warn("⚠️ Redis cache error (continuing without cache):", cacheErr.message);
    }

    sendSuccess(res, response);
  } catch (err) {
    console.error("❌ Feed error:", err.message);
    console.error("Stack:", err.stack);
    sendError(res, 500, `Server error: ${err.message}`);
  }
});

app.get("/api/users/:userId/posts", auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { cursor } = req.query;
    const limit = 12;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return sendError(res, 400, "Invalid user ID");
    }

    const cacheKey = cacheHelper.keys.userPosts(userId, cursor || "first");

    try {
      if (redisHelpers?.getJSON) {
        const cached = await redisHelpers.getJSON(cacheKey);
        if (cached) {
          console.log("✅ User posts cache hit");
          return sendSuccess(res, cached);
        }
      }
    } catch (cacheErr) {
      console.warn("⚠️ Cache error:", cacheErr.message);
    }

    const query = { userId: new mongoose.Types.ObjectId(userId) };
    if (cursor) {
      const parsedCursor = new Date(cursor);
      if (!isNaN(parsedCursor)) {
        query.createdAt = { $lt: parsedCursor };
      }
    }

    const posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const formatted = posts.map((post) => ({
      id: post._id,
      username: post.username,
      displayName: post.displayName,
      avatar: post.avatarUrl || "👤",
      content: post.content,
      mediaUrl: post.mediaUrl,
      timestamp: formatTimestamp(post.createdAt),
      createdAt: post.createdAt,
      likes: Array.isArray(post.likes) ? post.likes.length : 0,
      comments: Array.isArray(post.comments) ? post.comments.length : 0,
      liked:
        Array.isArray(post.likes) &&
        post.likes.some((id) => id.toString() === req.user._id.toString()),
    }));

    const nextCursor =
      formatted.length === limit ? formatted[formatted.length - 1].createdAt.toISOString() : null;

    const response = {
      posts: formatted.map(({ createdAt, ...rest }) => rest),
      nextCursor,
    };

    try {
      if (redisHelpers?.setJSON) {
        await redisHelpers.setJSON(cacheKey, response, { ex: CACHE_TTL.userPosts });
      }
    } catch (cacheErr) {
      console.warn("⚠️ Cache error:", cacheErr.message);
    }

    sendSuccess(res, response);
  } catch (err) {
    console.error("❌ User posts error:", err);
    sendError(res, 500, "Server error");
  }
});

app.post("/api/posts/:postId/like", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return sendError(res, 404, "Post not found");

    const likeIdx = post.likes.findIndex(
      (id) => id.toString() === req.user._id.toString()
    );

    if (likeIdx > -1) {
      post.likes.splice(likeIdx, 1);
      await logEvent(req, "LIKE_REMOVED", "User unliked post", {
        postId: post._id,
      });
    } else {
      post.likes.push(req.user._id);
      await logEvent(req, "LIKE_ADDED", "User liked post", {
        postId: post._id,
      });

      if (post.userId.toString() !== req.user._id.toString()) {
        const Notification = require("./models/Notification");
        await Notification.create({
          user: post.userId,
          actor: req.user._id,
          verb: "like",
          targetType: "Post",
          targetId: post._id,
          read: false,
        });
        await cacheHelper.invalidateNotifications(post.userId);
      }
    }

    await post.save();
    await cacheHelper.invalidateFeed();

    sendSuccess(res, {
      likes: post.likes.length,
      liked: likeIdx === -1,
    });
  } catch (err) {
    console.error("❌ Like error:", err);
    sendError(res, 500, "Server error");
  }
});

app.delete("/api/posts/:postId", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return sendError(res, 404, "Post not found");
    if (post.userId.toString() !== req.user._id.toString()) {
      return sendError(res, 403, "Not authorized");
    }

    await logEvent(req, "POST_DELETED", "User deleted post", {
      postId: post._id,
    });

    await Post.findByIdAndDelete(req.params.postId);
    await cacheHelper.invalidateFeed();

    sendSuccess(res, { message: "Deleted" });
  } catch (err) {
    console.error("❌ Delete post error:", err);
    sendError(res, 500, "Server error");
  }
});

// ============= COMMENT ROUTES =============

app.post("/api/posts/:postId/comments", auth, async (req, res) => {
  try {
    const { text, content } = req.body;
    const commentText = text || content;

    if (!commentText || commentText.trim().length === 0) {
      return sendError(res, 400, "Comment required");
    }
    if (commentText.length > LIMITS.commentLength) {
      return sendError(res, 400, "Comment too long");
    }

    const Comment = require("./models/Comment");
    const Notification = require("./models/Notification");
    const post = await Post.findById(req.params.postId);

    if (!post) return sendError(res, 404, "Post not found");

    const comment = new Comment({
      post: req.params.postId,
      author: req.user._id,
      text: commentText.trim(),
    });

    await comment.save();

    await logEvent(req, "COMMENT_ADDED", "User added comment", {
      postId: post._id,
      commentId: comment._id,
    });

    await Post.updateOne(
      { _id: req.params.postId },
      {
        $push: { comments: comment._id },
        $inc: { commentCount: 1 },
      }
    );

    await cacheHelper.invalidateFeed();
    if (redisHelpers?.client()) {
      await redisHelpers.client().del(cacheHelper.keys.comments(req.params.postId));
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
      await cacheHelper.invalidateNotifications(post.userId);
    }

    await comment.populate("author", "username displayName avatarUrl");

    sendSuccess(res, {
      _id: comment._id,
      id: comment._id,
      text: comment.text,
      author: {
        _id: comment.author._id,
        id: comment.author._id,
        username: comment.author.username,
        displayName: comment.author.displayName || comment.author.username,
        avatarUrl: comment.author.avatarUrl,
      },
      createdAt: comment.createdAt,
    }, 201);
  } catch (err) {
    console.error("❌ Comment error:", err);
    sendError(res, 500, "Server error");
  }
});

app.get("/api/posts/:postId/comments", async (req, res) => {
  try {
    const cacheKey = cacheHelper.keys.comments(req.params.postId);
    
    try {
      const cached = await redisHelpers.getJSON(cacheKey);
      if (cached) {
        console.log("✅ Comments cache hit");
        return sendSuccess(res, cached);
      }
    } catch (cacheErr) {
      console.warn("⚠️ Redis cache read error:", cacheErr.message);
      // Continue without cache
    }

    const Comment = require("./models/Comment");
    const comments = await Comment.find({ post: req.params.postId })
      .populate("author", "username displayName avatarUrl")
      .sort({ createdAt: 1 })
      .lean();

    const formatted = comments.map((c) => ({
      _id: c._id,
      id: c._id,
      text: c.text,
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

    try {
      const size = JSON.stringify(formatted).length;
      if (size < 5242880) { // Only cache if under 5MB
        await redisHelpers.setJSON(cacheKey, formatted, { ex: CACHE_TTL.comments });
      }
    } catch (cacheErr) {
      console.warn("⚠️ Redis cache error:", cacheErr.message);
    }
    sendSuccess(res, formatted);
  } catch (err) {
    console.error("❌ Get comments error:", err);
    sendError(res, 500, "Server error");
  }
});

app.delete("/api/comments/:commentId", auth, async (req, res) => {
  try {
    const Comment = require("./models/Comment");
    const comment = await Comment.findById(req.params.commentId);

    if (!comment) return sendError(res, 404, "Comment not found");

    if (comment.author.toString() !== req.user._id.toString()) {
      const post = await Post.findById(comment.post);
      if (post.userId.toString() !== req.user._id.toString()) {
        return sendError(res, 403, "Not authorized");
      }
    }

    await logEvent(req, "COMMENT_DELETED", "User deleted comment", {
      commentId: comment._id,
    });

    await Post.updateOne(
      { _id: comment.post },
      {
        $pull: { comments: comment._id },
        $inc: { commentCount: -1 },
      }
    );

    await Comment.findByIdAndDelete(req.params.commentId);
    sendSuccess(res, { message: "Deleted", success: true });
  } catch (err) {
    console.error("❌ Delete comment error:", err);
    sendError(res, 500, "Server error");
  }
});

// ============= NOTIFICATION ROUTES =============

app.get("/api/notifications", auth, async (req, res) => {
  try {
    const Notification = require("./models/Notification");
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

    sendSuccess(res, formatted);
  } catch (err) {
    console.error("❌ Notifications error:", err);
    sendError(res, 500, "Server error");
  }
});

app.put("/api/notifications/:notificationId/read", auth, async (req, res) => {
  try {
    const Notification = require("./models/Notification");
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.notificationId, user: req.user._id },
      { read: true },
      { new: true }
    );

    if (!notification) return sendError(res, 404, "Not found");

    sendSuccess(res, { message: "Marked as read", notification });
  } catch (err) {
    console.error("❌ Mark read error:", err);
    sendError(res, 500, "Server error");
  }
});

app.get("/api/notifications/unread/count", auth, async (req, res) => {
  try {
    const Notification = require("./models/Notification");
    const count = await Notification.countDocuments({
      user: req.user._id,
      read: false,
    });
    sendSuccess(res, { count });
  } catch (err) {
    console.error("❌ Unread count error:", err);
    sendError(res, 500, "Server error");
  }
});

// ============= ANALYTICS & TRENDING =============

app.get("/api/analytics/:period", auth, async (req, res) => {
  try {
    const { period } = req.params;
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
      return sendError(res, 400, "Invalid period");
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
      const likeCount = post.likes?.length || 0;
      let index;

      if (groupBy === "day") {
        const daysDiff = Math.floor((now - postDate) / (1000 * 60 * 60 * 24));
        index = 6 - daysDiff;
      } else if (groupBy === "week") {
        const weeksDiff = Math.floor((now - postDate) / (1000 * 60 * 60 * 24 * 7));
        index = 3 - weeksDiff;
      } else if (groupBy === "month") {
        const monthsDiff =
          (now.getFullYear() - postDate.getFullYear()) * 12 +
          (now.getMonth() - postDate.getMonth());
        index = 5 - monthsDiff;
      }

      if (index >= 0 && index < labels.length) {
        likesData[index] += likeCount;
      }
    });

    let positive = 0, negative = 0, neutral = 0;
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

    if (posts.length === 0) {
      positive = neutral = negative = 1;
    }

    let topPost = posts.reduce((max, post) => {
      const postLikes = post.likes?.length || 0;
      const maxLikes = max.likes?.length || 0;
      return postLikes > maxLikes ? post : max;
    }, posts[0] || null);

    if (!topPost) {
      topPost = { content: "No posts yet", likes: [] };
    }

    const hashtagCounts = {};
    posts.forEach((post) => {
      const hashtags = (post.content || "").match(/#\w+/g) || [];
      hashtags.forEach((tag) => {
        hashtagCounts[tag] = (hashtagCounts[tag] || 0) + 1;
      });
    });

    let trendingHashtag = { tag: "No hashtags yet", count: 0 };
    Object.entries(hashtagCounts).forEach(([tag, count]) => {
      if (count > trendingHashtag.count) {
        trendingHashtag = { tag, count };
      }
    });

    sendSuccess(res, {
      ok: true,
      data: {
        labels,
        likes: likesData,
        sentiment: { positive, negative, neutral },
        topPost: {
          text: topPost.content || "No posts yet",
          likes: topPost.likes?.length || 0,
        },
        trendingHashtag,
      },
    });
  } catch (err) {
    console.error("❌ Analytics error:", err);
    sendError(res, 500, "Server error");
  }
});

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

    if (Object.keys(hashtagCounts).length === 0) {
      return sendSuccess(res, { hashtag: null, posts: [] });
    }

    const topTag = Object.entries(hashtagCounts).sort((a, b) => b[1] - a[1])[0][0];
    const trendingPosts = posts.filter((p) => (p.content || "").includes(topTag));

    sendSuccess(res, { hashtag: topTag, posts: trendingPosts });
  } catch (err) {
    console.error("❌ Trending error:", err);
    sendError(res, 500, "Server error");
  }
});

// ============= ADMIN ROUTES =============

app.get("/api/admin/info", auth, adminAuth, (req, res) => {
  sendSuccess(res, { username: req.user.username });
});

app.get("/api/admin/logs", auth, adminAuth, async (req, res) => {
  try {
    const { eventType, username } = req.query;
    const must = [];

    if (eventType) must.push({ match_phrase: { eventType } });
    if (username) must.push({ match_phrase: { username } });

    const esQuery = must.length > 0 ? { bool: { must } } : { match_all: {} };

    try {
      const result = await esClient.search({
        index: "socialsync-logs-*",
        body: {
          query: esQuery,
          sort: [{ timestamp: { order: "desc" } }],
          size: 100,
        },
      });

      const logs = (result?.body?.hits?.hits || result?.hits?.hits || []).map(
        (hit) => hit._source || hit
      );

      sendSuccess(res, { logs });
    } catch (esErr) {
      console.warn("⚠️ ES error:", esErr.message);
      sendSuccess(res, { logs: [], error: "ES unavailable" });
    }
  } catch (error) {
    console.error("❌ Logs error:", error);
    sendError(res, 500, "Server error");
  }
});

app.get("/api/admin/test-log", auth, adminAuth, async (req, res) => {
  try {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    sendSuccess(res, { message: "Test log sent" });
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

app.get("/api/admin/stats", auth, adminAuth, async (req, res) => {
  try {
    try {
      const result = await esClient.search({
        index: "socialsync-logs-*",
        body: {
          aggs: {
            by_event: { terms: { field: "eventType.keyword", size: 20 } },
            logins: { filter: { term: { "eventType.keyword": "LOGIN" } } },
          },
          size: 0,
        },
      });

      const totalUsers = await User.countDocuments();
      const totalPosts = await Post.countDocuments();
      const aggs = result?.body?.aggregations || result?.aggregations || {};

      return sendSuccess(res, {
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
    } catch (esErr) {
      console.warn("⚠️ ES error:", esErr.message);
      const totalUsers = await User.countDocuments();
      const totalPosts = await Post.countDocuments();

      return sendSuccess(res, {
        totalLogins: 0,
        totalUsers,
        totalPosts,
        postsToday: 0,
        totalEngagement: 0,
        highPriorityEvents: 0,
        topEvents: [],
      });
    }
  } catch (error) {
    console.error("❌ Stats error:", error);
    sendError(res, 500, "Server error");
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
      users.map(async (user) => {
        const postsCount = await Post.countDocuments({ userId: user._id });
        return {
          _id: user._id,
          username: user.username,
          displayName: user.displayName || user.username,
          followersCount: user.followersCount || 0,
          followingCount: user.followingCount || 0,
          postsCount,
          createdAt: user.createdAt,
        };
      })
    );

    sendSuccess(res, { users: usersWithPosts });
  } catch (error) {
    console.error("❌ Admin users error:", error);
    sendError(res, 500, "Server error");
  }
});

// ============= HEALTH & ERROR HANDLING =============

app.get("/health", async (req, res) => {
  const health = {
    uptime: process.uptime(),
    timestamp: Date.now(),
    status: "ok",
    services: {},
  };

  try {
    await mongoose.connection.db.admin().ping();
    health.services.mongodb = "connected";
  } catch (e) {
    health.services.mongodb = "disconnected";
    health.status = "degraded";
  }

  try {
    if (redisHelpers?.client()) {
      await redisHelpers.client().ping();
      health.services.redis = "connected";
    }
  } catch (e) {
    health.services.redis = "disconnected";
    health.status = "degraded";
  }

  const statusCode = health.status === "ok" ? 200 : 503;
  res.status(statusCode).json(health);
});

app.use((err, req, res, next) => {
  console.error("❌ Global error:", err);
  const statusCode = err.statusCode || 500;
  const message = err.isOperational ? err.message : "Internal server error";

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === "development" && {
      stack: err.stack,
      details: err.details,
    }),
  });
});

// ============= SERVER STARTUP =============

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";

require("./cron/trendingCron");

server.listen(PORT, HOST, () => {
  console.log(`✅ Server + Socket.IO running on port ${PORT}`);
  console.log(`📍 Access via: http://localhost:${PORT}`);
  const ips = os.networkInterfaces();
  for (const name of Object.keys(ips)) {
    for (const iface of ips[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        console.log(`📍 Access via IP: http://${iface.address}:${PORT}`);
      }
    }
  }
});

// ============= GRACEFUL SHUTDOWN =============

let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n⚠️ Received ${signal}, shutting down...`);

  server.close(async () => {
    console.log("✅ HTTP server closed");

    try {
      io.close(() => console.log("✅ Socket.IO closed"));
      await mongoose.connection.close();
      console.log("✅ MongoDB closed");

      if (redisHelpers?.client()) {
        await redisHelpers.client().quit();
        console.log("✅ Redis closed");
      }

      await esClient.close();
      console.log("✅ Elasticsearch closed");

      console.log("✅ Graceful shutdown completed");
      process.exit(0);
    } catch (error) {
      console.error("❌ Shutdown error:", error);
      process.exit(1);
    }
  });

  setTimeout(() => {
    console.error("⚠️ Forced shutdown after timeout");
    process.exit(1);
  }, 30000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
});
