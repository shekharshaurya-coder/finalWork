// server.js - FIXED VERSION
require("dotenv").config();

console.log("🔐 ADMIN_USERNAMES from .env:", process.env.ADMIN_USERNAMES);

const path = require("path");
const express = require("express");
const User = require("./models/User");
const Post = require("./models/Post");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const auth = require("./middleware/auth");
const connectDB = require("./db");
const { redisHelpers } = require("./db");
const Sentiment = require("sentiment");
const sentimentAnalyzer = new Sentiment();
const mongoose = require("mongoose");
const {
  Types: { ObjectId },
} = mongoose;
const Follow = require("./models/Follow");
const { Server } = require("socket.io");
const http = require("http");
const { Types } = require("mongoose");
//const authRoutes = require("./routes/auth.cjs");
const notificationsRouter = require("./routes/notifications"); // path you chose
const messagesRouter = require("./routes/messages");
const trendingRouter = require("./routes/trending");
const logDemoRoutes = require('./routes/logDemo');


// ============== BULLMQ QUEUES ==============
const mediaQueue = require("./queues/media.queue");

// ============== ADMIN ==============
const logger = require('./services/logger');
const adminAuth = require('./middleware/adminAuth');

// ============== ELASTIC-SEARCH ==============
const { Client } = require('@elastic/elasticsearch');
const esClient = new Client({ node: 'http://localhost:9200' });

// ============== INITIALIZE APP ==============
const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

//app.use(express.static("frontend"));
//app.use("/api/auth", authRoutes);
app.use("/api/notifications", notificationsRouter);
app.use("/api/trending", trendingRouter);


// if using socket.io, attach io to app so routes can emit

//writen by shekhar 
async function logplease(req,event,desc ,md){
  await logger.logFromRequest(req, {
  eventType: event,
  description: desc,
  metadata:  md ,
});


}

// Enable CORS for development
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Serve static files from frontend folder
app.use(express.static(path.join(__dirname, "..", "frontend")));

// Redirect root to login
app.get("/", (req, res) => {
  res.redirect("/login.html");
});

// ============== CONNECT DATABASE ==============
connectDB();

// ============== AUTH ROUTES ==============
//socket io
const server = http.createServer(app); // ✅ ADD THIS

// ✅ ADD SOCKET.IO SETUP
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});
app.set("io", io); // after io created

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Enable CORS for development
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});
//for messages
app.use("/api", messagesRouter);
app.use("/api/conversations", auth, messagesRouter); // ensure auth is used here


//following list end points

// ==============================
// GET FOLLOWERS OF A USER
// ==============================
// GET followers (users who follow :id) with followerCount
app.use('/demo', logDemoRoutes);
app.get("/api/users/:id/followers", async (req, res) => {
  try {
    const userId = req.params.id;
    console.log("[route] GET /api/users/:id/followers ->", userId);

    const followDocs = await Follow.find({ followee: userId }).populate(
      "follower",
      "username name avatarUrl"
    );

    if (!followDocs || followDocs.length === 0) {
      return res.json([]);
    }

    const userIds = followDocs
      .map((f) => f.follower && f.follower._id)
      .filter(Boolean)
      .map((id) => id.toString());

    const counts = await Follow.aggregate([
      {
        $match: {
          followee: { $in: userIds.map((id) => new Types.ObjectId(id)) },
        },
      },
      { $group: { _id: "$followee", count: { $sum: 1 } } },
    ]);

    const countMap = counts.reduce((m, c) => {
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
        followerCount: countMap[u._id.toString()] || 0,
      };
    });

    return res.json(followers);
  } catch (err) {
    console.error("Error in /api/users/:id/followers:", err);
    // dev-only: send stack for quick debugging; remove in prod
    return res
      .status(500)
      .json({ error: "Server error", message: err.message, stack: err.stack });
  }
});

app.get("/api/users/:id/following-list", async (req, res) => {
  try {
    const userId = req.params.id;
    console.log("[route] GET /api/users/:id/following-list ->", userId);

    const followDocs = await Follow.find({ follower: userId }).populate(
      "followee",
      "username name avatarUrl"
    );

    if (!followDocs || followDocs.length === 0) {
      return res.json([]);
    }

    const userIds = followDocs
      .map((f) => f.followee && f.followee._id)
      .filter(Boolean)
      .map((id) => id.toString());

    const counts = await Follow.aggregate([
      {
        $match: {
          followee: { $in: userIds.map((id) => new Types.ObjectId(id)) },
        },
      },
      { $group: { _id: "$followee", count: { $sum: 1 } } },
    ]);

    const countMap = counts.reduce((m, c) => {
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
        followerCount: countMap[u._id.toString()] || 0,
      };
    });

    return res.json(following);
  } catch (err) {
    console.error("Error in /api/users/:id/following-list:", err);
    // dev-only: send stack for quick debugging; remove in prod
    return res
      .status(500)
      .json({ error: "Server error", message: err.message, stack: err.stack });
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, "..", "frontend")));

app.get("/", (req, res) => {
  res.redirect("/login.html");
});

// Connect to database
connectDB();

// ============== SOCKET.IO AUTHENTICATION ==============
// Store connected users: { userId: socketId }
const connectedUsers = new Map();

io.use((socket, next) => {
  const token = socket.handshake.auth.token;

  if (!token) {
    return next(new Error("Authentication error"));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.sub;
    socket.username = decoded.username;
    next();
  } catch (err) {
    next(new Error("Authentication error"));
  }
});

// ============== SOCKET.IO CONNECTIONS ==============
io.on("connection", (socket) => {
  console.log("✅ User connected:", socket.username, "Socket ID:", socket.id);

  // Store user's socket ID
  connectedUsers.set(socket.userId, socket.id);

  // Notify user is online
  socket.broadcast.emit("user_online", {
    userId: socket.userId,
    username: socket.username,
  });

  // Send list of online users
  const onlineUsers = Array.from(connectedUsers.keys());
  io.emit("online_users", onlineUsers);

  // Join user's personal room
  socket.join(socket.userId);

  // Handle typing indicator
  socket.on("typing", (data) => {
    const recipientSocketId = connectedUsers.get(data.recipientId);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit("user_typing", {
        userId: socket.userId,
        username: socket.username,
        isTyping: data.isTyping,
      });
    }
  });

  // Handle new message
  // Handle new message
  // Find this section in your server.js (around line 150-200)
  // Replace the existing socket.on('send_message') handler with this:

  // Handle new message
  // Handle new message
socket.on("send_message", async (data) => {
  try {
    const Message = require("./models/Message");
    // ❌ const Notification = require("./models/Notification");  // REMOVE THIS LINE

    console.log(
      "📤 Sending message from:",
      socket.username,
      "to:",
      data.recipientId
    );

    // Create conversation ID (sorted user IDs)
    const conversationId = [socket.userId, data.recipientId].sort().join("_");

    // Save message to database
    const newMessage = await Message.create({
      conversationId: conversationId,
      sender: socket.userId,
      recipients: [data.recipientId],
      text: data.text,
      deliveredTo: [],
      readBy: [],
    });

    console.log("✅ Message saved to database:", newMessage._id);

    // Populate sender info
   logplease(req,'MESSAGE_SENT', 'User sent a message', { recipientId: data.recipientId, messageId: newMessage._id });
    const populatedMessage = await Message.findById(newMessage._id)
      .populate("sender", "username displayName avatarUrl")
      .lean();

    const messageData = {
      id: populatedMessage._id,
      conversationId: conversationId,
      sender: {
        id: populatedMessage.sender._id,
        username: populatedMessage.sender.username,
        displayName:
          populatedMessage.sender.displayName ||
          populatedMessage.sender.username,
        avatarUrl: populatedMessage.sender.avatarUrl,
      },
      text: populatedMessage.text,
      createdAt: populatedMessage.createdAt,
      delivered: false,
      read: false,
    };

    // ✅ NO MORE Notification.create() HERE
    // (messages will still be delivered via 'new_message' event)

    // Send to sender (confirmation)
    socket.emit("message_sent", messageData);

    // Send to recipient if online
    const recipientSocketId = connectedUsers.get(data.recipientId);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit("new_message", messageData);

      // Mark as delivered
      await Message.findByIdAndUpdate(newMessage._id, {
        $addToSet: { deliveredTo: data.recipientId },
      });

      socket.emit("message_delivered", { messageId: newMessage._id });
     logplease(req,'MESSAGE_DELIVERED', 'Message delivered to recipient', { recipientId: data.recipientId, messageId: newMessage._id });

      console.log("✅ Message delivered to online recipient");
    } else {
      console.log("📪 Recipient offline (message stored, no socket yet)");
    }

    console.log(
      "📩 Message send complete:",
      socket.username,
      "→",
      data.recipientId
    );
  } catch (error) {
    console.error("❌ Error sending message:", error);
    socket.emit("message_error", { error: "Failed to send message" });
  }
});


  // Handle message read
socket.on("mark_read", async (data) => {
  try {
    const Message = require("./models/Message");

    const result = await Message.updateMany(
      {
        conversationId: data.conversationId,
        sender: data.senderId,
        readBy: { $ne: socket.userId },
      },
      {
        $addToSet: { readBy: socket.userId },
      }
    );

    console.log(`✅ Marked ${result.modifiedCount} messages as read`);
       if (result.modifiedCount > 0) {
      logplease('MESSAGE_READ', 'User read messages in a conversation', { conversationId: data.conversationId, senderId: data.senderId });
    }

    // Notify sender that messages were read
    const senderSocketId = connectedUsers.get(data.senderId);
    if (senderSocketId) {
      io.to(senderSocketId).emit("messages_read", {
        conversationId: data.conversationId,
        readBy: socket.userId,
      });
    }
  } catch (error) {
    console.error("Error marking messages as read:", error);
  }
});

  // Handle disconnect
  socket.on("disconnect", () => {
    console.log("❌ User disconnected:", socket.username);
    connectedUsers.delete(socket.userId);

    // Notify user is offline
    socket.broadcast.emit("user_offline", { userId: socket.userId });

    // Update online users list
    const onlineUsers = Array.from(connectedUsers.keys());
    io.emit("online_users", onlineUsers);
  });
});

// ============== REST API ROUTES ==============

// GET CONVERSATIONS
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

    const conversationsMap = new Map();

    messages.forEach((msg) => {
      const convId = msg.conversationId;

      if (!conversationsMap.has(convId)) {
        const otherUser =
          msg.sender._id.toString() === req.user._id.toString()
            ? msg.recipients[0]
            : msg.sender;

        conversationsMap.set(convId, {
          conversationId: convId,
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
      }
    });

    // Count unread messages for each conversation
    for (const [convId, conv] of conversationsMap) {
      const unreadCount = await Message.countDocuments({
        conversationId: convId,
        sender: { $ne: req.user._id },
        readBy: { $ne: req.user._id },
      });
      conv.unreadCount = unreadCount;
    }

    const conversations = Array.from(conversationsMap.values());
    res.json(conversations);
  } catch (error) {
    console.error("Error getting conversations:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// GET MESSAGES FOR A CONVERSATION
app.get("/api/messages/conversation/:userId", auth, async (req, res) => {
  try {
    const Message = require("./models/Message");
    const otherUserId = req.params.userId;

    // Create conversation ID
    const conversationId = [req.user._id.toString(), otherUserId]
      .sort()
      .join("_");

    // Get all messages in conversation
    const messages = await Message.find({ conversationId })
      .populate("sender", "username displayName avatarUrl")
      .sort({ createdAt: 1 })
      .lean();

    const formattedMessages = messages.map((msg) => ({
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

    res.json(formattedMessages);
  } catch (error) {
    console.error("Error getting messages:", error);
    res.status(500).json({ message: "Server error" });
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

    console.log(`💬 Unread messages for ${req.user.username}:`, count);
    res.json({ count });
  } catch (err) {
    console.error("Get unread messages count error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// SIGNUP
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { email, username, age, gender, password } = req.body;
    
    // Check all fields are provided
    if (!email || !username || !age || !gender || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Validate username starts with a letter
    if (!/^[a-zA-Z]/.test(username)) {
      return res.status(400).json({ message: "Username must start with a letter" });
    }

    // Validate username format (letter, then letters/numbers/underscores)
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(username)) {
      return res.status(400).json({ 
        message: "Username can only contain letters, numbers and underscores" 
      });
    }

    // Validate age
    const ageNum = parseInt(age);
    if (isNaN(ageNum) || ageNum < 16) {
      return res.status(400).json({ message: "You must be at least 16 years old to sign up" });
    }

    if (ageNum > 120) {
      return res.status(400).json({ message: "Please enter a valid age" });
    }

    // Validate gender
    const validGenders = ['male', 'female', 'other', 'prefer-not-to-say'];
    if (!validGenders.includes(gender)) {
      return res.status(400).json({ message: "Invalid gender selection" });
    }

    // Validate password - no special characters
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      return res.status(400).json({ message: "Password cannot contain special characters" });
    }

    // Check password length
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    // Check if email already exists
    if (await User.findOne({ email })) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // Check if username already exists
    if (await User.findOne({ username })) {
      return res.status(400).json({ message: "Username taken" });
    }

    // Hash password
    const hashed = await bcrypt.hash(password, 10);

    // Create new user
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
    logplease(req,'SIGNUP', 'New user signed up', { userId: newUser._id, username: newUser.username });

   

    // Ensure JWT secret exists
    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET not set");
      return res.status(500).json({ message: "Server configuration error" });
    }

    // Sign token with multiple common id claims so middleware accepts it
    const userIdStr = newUser._id.toString();
    const token = jwt.sign(
      {
        userId: userIdStr,
        id: userIdStr,
        _id: userIdStr,
        sub: userIdStr,
        username: newUser.username,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(201).json({
      id: newUser._id,
      userId: userIdStr,
      email: newUser.email,
      username: newUser.username,
      age: newUser.age,
      gender: newUser.gender,
      token,
    });
  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// LOGIN
app.post("/api/auth/login", async (req, res) => {
  try {
    console.log("===== LOGIN ATTEMPT =====");
    console.log("Username received:", req.body.username);

    const { username, password } = req.body;

    const user = await User.findOne({ username });
    console.log("User found in DB:", !!user);

    if (!user) {
      console.log("❌ No user found");
      return res.status(404).json({ message: "Account not found" });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    console.log("Password correct:", ok);

    if (!ok) {
      console.log("❌ Wrong password");
      return res.status(401).json({ message: "Incorrect password" });
    }

    // Generate JWT
    const tokenPayload = {
      sub: user._id.toString(),
      username: user.username,
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    const device = req.headers['user-agent'];
    const ip = req.ip || req.connection.remoteAddress;
    logplease(req,'LOGIN', 'User logged in', { userId: user._id, username: user.username, device, ip });

    // ✅ CHECK IF ADMIN
    const adminUsernames = process.env.ADMIN_USERNAMES?.split(',').map(u => u.trim()) || [];
    const isAdmin = adminUsernames.includes(username);
    console.log("🔐 Admin check:", { username, adminUsernames, isAdmin });

    console.log("===== TOKEN GENERATED =====");
    console.log("User ID (sub):", tokenPayload.sub);
    console.log("Username:", tokenPayload.username);
    console.log("Is Admin:", isAdmin);
    console.log("JWT Token:", token);
    console.log("===========================\n");

    return res.json({
      token,
      isAdmin, // ✅ ADD THIS
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
    res.status(500).json({ message: "Server error", detail: err.message });
  }
});

//route to check the jwt
app.get("/debug/jwt", (req, res) => {
  const token = jwt.sign(
    { sub: "USER_ID_HERE", username: "USERNAME_HERE" },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
  res.json({ token });
});

// ============== USER ROUTES ==============

// GET current user
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
    console.error("Get user error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// SEARCH USERS
// SEARCH USERS
app.get("/api/users/search", auth, async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim() === "") {
      return res.json([]);
    }

    const cacheKey = cacheHelper.keys.search(q);  // ✅ add this line

    await logplease(req, 'USER_SEARCH', 'User performed a search', {
      query: q,
      userId: req.user._id,
    });

    // Try to get from cache
    const cached = await redisHelpers.getJSON(cacheKey);
    if (cached) {
      console.log("✅ Search cache hit for:", q);
      return res.json(cached);
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
      avatarUrl: u.avatarUrl,
      followersCount: u.followersCount || 0,
    }));

    // Cache for 10 minutes
    await redisHelpers.setJSON(cacheKey, result, { ex: 600 });

    res.json(result);
  } catch (err) {
    console.error("Search users error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// FOLLOW USER - FIXED
// REPLACE THE FOLLOW ROUTES IN YOUR server.js WITH THESE FIXED VERSIONS

// ============== FOLLOW/UNFOLLOW ROUTES - FIXED ==============

// FOLLOW USER - FIXED WITH PROPER ERROR HANDLING
// ===== Follow / Unfollow / Check routes (clean, single copy) =====

app.post("/api/users/:userId/follow", auth, async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    const me = req.user && req.user._id && req.user._id.toString();

    console.log("Follow request:", { by: me, target: targetUserId });

    // validate IDs
    if (!targetUserId || !ObjectId.isValid(targetUserId)) {
      return res.status(400).json({ message: "Invalid target user id" });
    }
    if (!me) return res.status(401).json({ message: "Unauthorized" });
    if (me === targetUserId)
      return res.status(400).json({ message: "Cannot follow yourself" });

    // check target exists
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) return res.status(404).json({ message: "User not found" });

    // Try to create follow (unique index on (follower, followee) should exist)
    try {
      const newFollow = await Follow.create({
        follower: req.user._id,
        followee: targetUserId,
        status: "accepted",
      });

      // increment counts only after creation
      await User.findByIdAndUpdate(targetUserId, {
        $inc: { followersCount: 1 },
      });
      await User.findByIdAndUpdate(req.user._id, {
        $inc: { followingCount: 1 },
      });

      // ✅ LOG USER FOLLOWS
      logplease(req,'USER_FOLLOWS', 'User followed another user', { by: me, target: targetUserId });

      // ✅ LOG SOMEONE FOLLOWS YOU (for target user)
     
      // Invalidate follow-related caches
      await cacheHelper.invalidateFollowCaches(me, targetUserId);

      // best-effort notification
      try {
        const Notification = require("./models/Notification");
        await Notification.create({
          user: targetUserId,
          actor: req.user._id,
          verb: "follow",
          targetType: "User",
          targetId: req.user._id,
          read: false,
        });
      } catch (nerr) {
        console.error(
          "Notification creation failed (ignored):",
          nerr && nerr.message
        );
      }

      return res.json({
        message: "Followed successfully",
        following: true,
        followId: newFollow._id,
      });
    } catch (createErr) {
      // duplicate follow (unique index) -> user-friendly response
      if (createErr && createErr.code === 11000) {
        return res.status(400).json({ message: "Already following this user" });
      }
      console.error("Follow create error:", createErr);
      return res
        .status(500)
        .json({ message: "Server error", error: createErr.message });
    }
  } catch (err) {
    console.error("Follow user error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

app.delete("/api/users/:userId/follow", auth, async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    const me = req.user && req.user._id && req.user._id.toString();

    console.log("Unfollow request:", { by: me, target: targetUserId });

    if (!targetUserId || !ObjectId.isValid(targetUserId)) {
      return res.status(400).json({ message: "Invalid target user id" });
    }
    if (!me) return res.status(401).json({ message: "Unauthorized" });

    const deleted = await Follow.findOneAndDelete({
      follower: req.user._id,
      followee: targetUserId,
    });

    if (!deleted) {
      return res.status(400).json({ message: "Not following this user" });
    }

    // decrement counts (note: could add clamping later)
    await User.findByIdAndUpdate(targetUserId, {
      $inc: { followersCount: -1 },
    });
    await User.findByIdAndUpdate(req.user._id, {
      $inc: { followingCount: -1 },
    });

    // ✅ LOG UNFOLLOW (using USER_FOLLOWS event with metadata)
     logplease(req,'USER_UNFOLLOWS', 'User unfollowed another user', { by: me, target: targetUserId });

    // Invalidate follow-related caches
    await cacheHelper.invalidateFollowCaches(me, targetUserId);

    return res.json({ message: "Unfollowed successfully", following: false });
  } catch (err) {
    console.error("Unfollow user error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

app.get("/api/users/:userId/following", auth, async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    if (!targetUserId || !ObjectId.isValid(targetUserId))
      return res.json({ following: false });

    const follow = await Follow.findOne({
      follower: req.user._id,
      followee: targetUserId,
    });

    res.json({ following: !!follow });
  } catch (err) {
    console.error("Check following error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// UPDATE PROFILE - FIXED
app.put("/api/users/me", auth, async (req, res) => {
  try {
    const allowed = ["bio", "avatarUrl", "displayName", "username"];
    const updates = {};

    allowed.forEach((key) => {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    });

    // Check if username is being changed and if it's already taken
    if (updates.username && updates.username !== req.user.username) {
      const existingUser = await User.findOne({
        username: updates.username,
        _id: { $ne: req.user._id },
      });

      if (existingUser) {
        return res.status(400).json({ message: "Username already taken" });
      }
    }

    const updated = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    }).select("-passwordHash");

    if (!updated) return res.status(404).json({ message: "User not found" });
   logplease(req,'PROFILE_UPDATED', 'User updated their profile', { userId: req.user._id, username: req.user.username, updates });
     if (updates.avatarUrl) {
      logplease(req,'AVATAR_UPDATED', 'User updated their avatar', { userId: req.user._id, username: req.user.username });
    }

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
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ============== MEDIA ROUTES ==============

// GET ALL MEDIA FOR CURRENT USER
app.get("/api/media/all", auth, async (req, res) => {
  try {
    const Media = require("./models/Media");

    console.log("📥 Fetching media for user:", req.user._id);
    
    const mediaList = await Media.find({ ownerId: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    console.log("✅ Found media count:", mediaList.length);
    res.json(mediaList);
  } catch (err) {
    console.error("Get media error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// UPLOAD MEDIA (Direct save)
app.post("/api/media/upload", auth, async (req, res) => {
  try {
    const Media = require("./models/Media");
    const { url, mimeType, storageKey } = req.body;

    if (!url || !storageKey) {
      return res.status(400).json({ message: "URL and storageKey required" });
    }

    const newMedia = await Media.create({
      ownerType: "User",
      ownerId: req.user._id,
      url: url,
      storageKey: storageKey,
      mimeType: mimeType || "application/octet-stream",
      processed: true,
    });
   logplease(req,'MEDIA_UPLOADED', 'User uploaded new media', { userId: req.user._id, username: req.user.username, mediaId: newMedia._id });

    console.log("✅ Media uploaded:", newMedia._id);
    res.status(201).json(newMedia);
  } catch (err) {
    console.error("Upload media error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE MEDIA
app.delete("/api/media/:mediaId", auth, async (req, res) => {
  try {
    const Media = require("./models/Media");

    const media = await Media.findById(req.params.mediaId);
    if (!media) {
      return res.status(404).json({ message: "Media not found" });
    }

    // Check if user owns this media
    if (media.ownerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to delete this media" });
    }
 logplease('MEDIA_DELETED', 'User deleted media', { userId: req.user._id, username: req.user.username, mediaId: req.params.mediaId });
    await Media.findByIdAndDelete(req.params.mediaId);

    console.log("✅ Media deleted:", req.params.mediaId);
    res.json({ message: "Media deleted successfully" });
  } catch (err) {
    console.error("Delete media error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ============== POST ROUTES ==============

// CREATE POST
app.post("/api/posts", auth, async (req, res) => {
  try {
    console.log('🔧 POST /api/posts route HIT by user:', req.user.username);
    const { content, type, mediaUrl } = req.body;
    console.log('  Content:', content ? content.substring(0, 20) + '...' : 'EMPTY');

    if (!content || content.trim() === "") {
      return res.status(400).json({ message: "Content is required" });
    }

    const user = await User.findById(req.user._id);

    console.log('  Creating post in MongoDB...');
    const newPost = await Post.create({
      userId: req.user._id,
      username: req.user.username,
      content,
      type: type || "text",
      mediaUrl: mediaUrl || null,
      likes: [],
      comments: [],
    });

    console.log('📝 POST_CREATED: About to log post creation for user:', req.user.username);
    logplease(req,'POST_CREATED', 'User created a new post', { postId: newPost._id, userId: req.user._id, username: req.user.username, hasMedia: !!mediaUrl });
    console.log('📝 POST_CREATED: Logger call completed for post:', newPost._id.toString());

    // ✅ QUEUE MEDIA PROCESSING JOB IF MEDIA EXISTS
    if (mediaUrl) {
      try {
        await mediaQueue.add("process-media", {
          postId: newPost._id,
          userId: req.user._id,
          filePath: mediaUrl,
          type: type || "text",
        });
        logplease(req,'MEDIA_PROCESSING_QUEUED', 'Media processing job queued for post', { postId: newPost._id, userId: req.user._id, username: req.user.username });
        console.log("✅ Media processing job queued for post:", newPost._id);
      } catch (queueErr) {
        console.error("❌ Failed to queue media job:", queueErr);
        // Don't fail the post creation if queuing fails
      }
    }

    // Invalidate feed cache when new post is created
    await cacheHelper.invalidateFeedCache();
    
    // Also invalidate user's own posts cache
    if (redisHelpers && redisHelpers.client()) {
      const userPostsKeys = await redisHelpers.client().keys(`user:posts:${req.user._id}:*`);
      if (userPostsKeys && userPostsKeys.length > 0) {
        await redisHelpers.client().del(...userPostsKeys);
        console.log(`✅ Invalidated ${userPostsKeys.length} user posts cache keys`);
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

// GET FEED
app.get("/api/posts/feed", auth, async (req, res) => {
  try {
    const { cursor } = req.query;
    const limit = 10; // Number of posts per page

    const cacheKey = cacheHelper.keys.feed(cursor || "first_page");

    // Try to get from cache
    const cached = await redisHelpers.getJSON(cacheKey);
    if (cached) {
      console.log(`✅ Feed cache hit for cursor: ${cursor || "first_page"}`);
      return res.json(cached);
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
      .populate("userId", "username displayName avatarUrl") // Use populate
      .lean();

    // Example for GET /api/posts/feed
const formattedPosts = posts.map((post) => {
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
    commentCount: post.commentCount || 0, // ✅ Use commentCount field
    comments: post.commentCount || 0, // ✅ Also for compatibility
    liked: Array.isArray(post.likes) && post.likes.some(id => id.toString() === req.user._id.toString()),
  };
});

    const nextCursor =
      formattedPosts.length === limit
        ? formattedPosts[formattedPosts.length - 1].createdAt.toISOString()
        : null;

    const response = {
      posts: formattedPosts.map(p => {
        const { createdAt, ...rest } = p; // Omit createdAt from final post object
        return rest;
      }),
      nextCursor,
    };

    // Cache for 1 minute
    await redisHelpers.setJSON(cacheKey, response, { ex: 60 });

    res.json(response);
  } catch (err) {
    console.error("Get feed error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET USER POSTS (Profile page posts)
app.get("/api/users/:userId/posts", auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { cursor } = req.query;
    const limit = 12; // Grid display

    console.log("📥 GET /api/users/:userId/posts called");
    console.log("   userId:", userId);
    console.log("   cursor:", cursor);
    console.log("   auth user:", req.user._id);

    // Validate userId
    if (!ObjectId.isValid(userId)) {
      console.log("❌ Invalid userId format");
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const cacheKey = cacheHelper.keys.userPosts(userId, cursor || "first");

    // Try to get from cache
    try {
      if (redisHelpers && redisHelpers.getJSON) {
        const cached = await redisHelpers.getJSON(cacheKey);
        if (cached) {
          console.log(`✅ User posts cache hit for userId: ${userId}`);
          return res.json(cached);
        }
      }
    } catch (cacheErr) {
      console.warn("⚠️ Cache read error (continuing):", cacheErr.message);
      // Continue without cache
    }

    const query = { userId: new ObjectId(userId) };
    if (cursor) {
      const parsedCursor = new Date(cursor);
      if (!isNaN(parsedCursor)) {
        query.createdAt = { $lt: parsedCursor };
      }
    }

    console.log("🔍 Query:", query);
    console.time("⏱️ Posts query");

    const posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .select("content mediaUrl likes comments createdAt username displayName avatarUrl")
      .lean();

    console.timeEnd("⏱️ Posts query");
    console.log("📦 Posts found:", posts.length);

    const formattedPosts = posts.map((post) => {
      return {
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
      };
    });

    const nextCursor =
      formattedPosts.length === limit
        ? formattedPosts[formattedPosts.length - 1].createdAt.toISOString()
        : null;

    const response = {
      posts: formattedPosts.map(p => {
        const { createdAt, ...rest } = p;
        return rest;
      }),
      nextCursor,
    };

    // Cache for 5 minutes
    try {
      if (redisHelpers && redisHelpers.setJSON) {
        await redisHelpers.setJSON(cacheKey, response, { ex: 300 });
      }
    } catch (cacheErr) {
      console.warn("⚠️ Cache write error (continuing):", cacheErr.message);
      // Continue even if caching fails
    }

    res.json(response);
  } catch (err) {
    console.error("❌ Get user posts error:", err);
    console.error("Error message:", err.message);
    console.error("Error stack:", err.stack);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// LIKE/UNLIKE POST
app.post("/api/posts/:postId/like", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const likeIndex = post.likes.findIndex(
      (id) => id.toString() === req.user._id.toString()
    );

    if (likeIndex > -1) {
      // Unlike
      post.likes.splice(likeIndex, 1);
      logplease(req,'❤️ LIKE_REMOVED', 'User unliked a post', { userId: req.user._id, username: req.user.username, postId: post._id });
      console.log('❤️ LIKE_REMOVED: About log unlike for user:', req.user.username);
      
      console.log(req,'❤️ LIKE_REMOVED: Logger call completed for post:', post._id.toString());
    } else {
      // Like
      post.likes.push(req.user._id);

      console.log('❤️ LIKE_ADDED: About to log like for user:', req.user.username);
    logplease(req,'❤️ LIKE_ADDED', 'User liked a post', { userId: req.user._id, username: req.user.username, postId: post._id });
      // Create notification if liking someone else's post
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
        // Invalidate notification cache for post author
        await cacheHelper.invalidateNotificationCache(post.userId);
      }
    }

    await post.save();

    // Invalidate feed and comments cache
    await cacheHelper.invalidateFeedCache();

    res.json({
      likes: post.likes.length,
      liked: likeIndex === -1,
    });
  } catch (err) {
    console.error("Like post error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE POST
app.delete("/api/posts/:postId", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    // Check if user owns the post
    if (post.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to delete this post" });
    }
    logplease(req,'🗑️ POST_DELETED', 'User deleted a post', { userId: req.user._id, username: req.user.username, postId: post._id })  ;
    // Delete post
    await Post.findByIdAndDelete(req.params.postId);

    // Invalidate feed cache
    await cacheHelper.invalidateFeedCache();

    // Invalidate user posts cache
    await redisHelpers.client().del(cacheHelper.keys.userPosts(req.user._id.toString(), "first"));

    res.json({ message: "Post deleted successfully" });
  } catch (err) {
    console.error("Delete post error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ============== COMMENT ROUTES ==============

// POST A COMMENT
app.post("/api/posts/:postId/comments", auth, async (req, res) => {
  try {
    const { text, content } = req.body; // Accept both 'text' and 'content'
    const commentText = text || content;
    const Comment = require("./models/Comment");
    const Notification = require("./models/Notification");

    if (!commentText || commentText.trim().length === 0) {
      return res.status(400).json({ message: "Comment cannot be empty" });
    }

    const post = await Post.findById(req.params.postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    // Create comment with 'text' field (matching Comment schema)
    const comment = new Comment({
      post: req.params.postId,
      author: req.user._id,
      text: commentText.trim(),
    });

    await comment.save();

    console.log('💬 COMMENT_ADDED: About to log comment for user:', req.user.username);
    await logplease(req,'💬 COMMENT_ADDED', 'User added a comment', { 
      userId: req.user._id, 
      username: req.user.username, 
      postId: post._id, 
      commentId: comment._id 
    });

    // ✅ Update post: add comment reference AND increment count
    await Post.updateOne(
      { _id: req.params.postId },
      { 
        $push: { comments: comment._id },
        $inc: { commentCount: 1 }
      }
    );

    // Invalidate caches
    await cacheHelper.invalidateFeedCache();
    if (redisHelpers && redisHelpers.client()) {
      await redisHelpers.client().del(cacheHelper.keys.comments(req.params.postId));
    }

    // Create notification for post author
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

    // Populate author info
    await comment.populate("author", "username displayName avatarUrl");

    // ✅ Return with proper field names
    res.status(201).json({
      _id: comment._id,
      id: comment._id, // For compatibility
      text: comment.text,
      content: comment.text, // For compatibility
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

// GET COMMENTS FOR A POST
// GET COMMENTS FOR A POST
app.get("/api/posts/:postId/comments", async (req, res) => {
  try {
    const cacheKey = cacheHelper.keys.comments(req.params.postId);

    // Try cache
    const cached = await redisHelpers.getJSON(cacheKey);
    if (cached) {
      console.log("✅ Comments cache hit for post:", req.params.postId);
      return res.json(cached);
    }

    const Comment = require("./models/Comment");

    const comments = await Comment.find({ post: req.params.postId })
      .populate("author", "username displayName avatarUrl")
      .sort({ createdAt: 1 }) // Oldest first for chat-like display
      .lean();

    const formattedComments = comments.map((c) => ({
      _id: c._id,
      id: c._id, // For compatibility
      text: c.text,
      content: c.text, // For compatibility
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

    // Cache for 5 minutes
    await redisHelpers.setJSON(cacheKey, formattedComments, { ex: 300 });

    res.json(formattedComments);
  } catch (err) {
    console.error("Get comments error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE A COMMENT
// DELETE A COMMENT - ALREADY CORRECT IN YOUR CODE
app.delete("/api/comments/:commentId", auth, async (req, res) => {
  try {
    const Comment = require("./models/Comment");

    const comment = await Comment.findById(req.params.commentId);
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    // Check authorization
    if (comment.author.toString() !== req.user._id.toString()) {
      const post = await Post.findById(comment.post);
      if (post.userId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: "Not authorized" });
      }
    }

    await logplease(req,'🗑️ COMMENT_DELETED', 'User deleted a comment', { 
      userId: req.user._id, 
      username: req.user.username, 
      commentId: comment._id 
    });

    // ✅ Remove comment from post AND decrement count
    await Post.updateOne(
      { _id: comment.post },
      { 
        $pull: { comments: comment._id },
        $inc: { commentCount: -1 }
      }
    );

    // Delete comment
    await Comment.findByIdAndDelete(req.params.commentId);

    res.json({ message: "Comment deleted", success: true });
  } catch (err) {
    console.error("Delete comment error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ============== NOTIFICATION ROUTES ==============

// GET NOTIFICATIONS - FIXED
app.get("/api/notifications", auth, async (req, res) => {
  try {
    const Notification = require("./models/Notification");

    const notifications = await Notification.find({ user: req.user._id })
      .populate("actor", "username displayName avatarUrl")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const formattedNotifications = notifications.map((n) => ({
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

    res.json(formattedNotifications);
  } catch (err) {
    console.error("Get notifications error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// MARK NOTIFICATION AS READ - FIXED
app.put("/api/notifications/:notificationId/read", auth, async (req, res) => {
  try {
    const Notification = require("./models/Notification");

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

// GET UNREAD NOTIFICATION COUNT
app.get("/api/notifications/unread/count", auth, async (req, res) => {
  try {
    const Notification = require("./models/Notification");
    
    const count = await Notification.countDocuments({
      user: req.user._id,
      read: false,
    });

    console.log(`📊 Unread notifications for ${req.user.username}:`, count);
    res.json({ count });
  } catch (err) {
    console.error("Get unread count error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ============== ANALYTICS ROUTES ==============

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
      userId: userId,
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
        const daysDiff = Math.floor((now - postDate) / (1000 * 60 * 60 * 24));
        index = 6 - daysDiff;
      } else if (groupBy === "week") {
        const weeksDiff = Math.floor(
          (now - postDate) / (1000 * 60 * 60 * 24 * 7)
        );
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

    if (posts.length === 0) {
      positive = 1;
      neutral = 1;
      negative = 1;
    }

    let topPost = posts.reduce((max, post) => {
      const postLikes = post.likes ? post.likes.length : 0;
      const maxLikes = max.likes ? max.likes.length : 0;
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
    Object.keys(hashtagCounts).forEach((tag) => {
      if (hashtagCounts[tag] > trendingHashtag.count) {
        trendingHashtag = { tag, count: hashtagCounts[tag] };
      }
    });

    res.json({
      ok: true,
      data: {
        labels: labels,
        likes: likesData,
        sentiment: {
          positive: positive,
          negative: negative,
          neutral: neutral,
        },
        topPost: {
          text: topPost.content || "No posts yet",
          likes: topPost.likes ? topPost.likes.length : 0,
        },
        trendingHashtag: trendingHashtag,
      },
    });
  } catch (err) {
    console.error("GET /api/analytics/:period error:", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

// ============== HELPER FUNCTIONS ==============

function formatTimestamp(date) {
  const now = new Date();
  const diff = Math.floor((now - new Date(date)) / 1000);

  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(date).toLocaleDateString();
}

// ============== START SERVER ==============

// ============== REDIS CACHE HELPER ==============
const cacheHelper = {
  // Cache keys
  keys: {
    search: (q) => `search:users:${q.toLowerCase()}`,
    userProfile: (id) => `user:profile:${id}`,
    followers: (id) => `user:followers:${id}`,
    following: (id) => `user:following:${id}`,
    feed: (cursor) => `feed:posts:${cursor || 'latest'}`,
    userPosts: (userId, cursor) => `user:posts:${userId}:${cursor || 'latest'}`,
    comments: (postId) => `post:comments:${postId}`,
    unreadNotifications: (userId) => `notif:unread:${userId}`,
    followStatus: (followerId, followeeId) =>
      `follow:${followerId}:${followeeId}`,
  },

  // Invalidate related caches
  invalidateUserCaches: async (userId) => {
    if (redisHelpers && redisHelpers.client()) {
      const client = redisHelpers.client();
      try {
        const pattern = `*user:${userId}*`;
        const keys = await client.keys(pattern);
        if (keys.length > 0) await client.del(keys);
      } catch (e) {
        console.warn("Cache invalidation error:", e.message);
      }
    }
  },

  invalidateFeedCache: async () => {
    if (redisHelpers && redisHelpers.client()) {
      const client = redisHelpers.client();
      try {
        // Delete all feed cache keys regardless of cursor value
        const keys = await client.keys("feed:posts:*");
        if (keys && keys.length > 0) {
          await client.del(...keys);
          console.log(`✅ Invalidated ${keys.length} feed cache keys`);
        }
      } catch (e) {
        console.warn("Feed cache invalidation error:", e.message);
      }
    }
  },

  invalidateFollowCaches: async (followerId, followeeId) => {
    if (redisHelpers && redisHelpers.client()) {
      const client = redisHelpers.client();
      try {
        await client.del(
          `follow:${followerId}:${followeeId}`,
          `user:followers:${followeeId}`,
          `user:following:${followerId}`
        );
      } catch (e) {
        console.warn("Follow cache invalidation error:", e.message);
      }
    }
  },

  invalidateNotificationCache: async (userId) => {
    if (redisHelpers && redisHelpers.client()) {
      const client = redisHelpers.client();
      try {
        await client.del(`notif:unread:${userId}`);
      } catch (e) {
        console.warn("Notification cache invalidation error:", e.message);
      }
    }
  },
};

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";

require("./cron/trendingCron");

// ================= TRENDING ROUTE =================
app.get("/api/trending", async (req, res) => {
  try {
    const Post = require("./models/Post");

    const posts = await Post.find().lean();
    let hashtagCounts = {};

    posts.forEach(post => {
      const tags = (post.content || "").match(/#\w+/g) || [];
      tags.forEach(tag => {
        hashtagCounts[tag] = (hashtagCounts[tag] || 0) + 1;
      });
    });

    if (Object.keys(hashtagCounts).length === 0) {
      return res.json({
        hashtag: null,
        posts: []
      });
    }

    const topTag = Object.entries(hashtagCounts)
      .sort((a, b) => b[1] - a[1])[0][0];

    const trendingPosts = posts.filter(p =>
      (p.content || "").includes(topTag)
    );

    res.json({
      hashtag: topTag,
      posts: trendingPosts
    });

  } catch (err) {
    console.error("Trending route error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


server.listen(PORT, HOST, () => {
  const ip = require("os").networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(ip)) {
    for (const iface of ip[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  console.log(`✅ Server + Socket.IO running on port ${PORT}`);
  console.log(`📍 Access via: http://localhost:${PORT}`);
  if (addresses.length > 0) {
    console.log(`📍 Access via IP: http://${addresses[0]}:${PORT}`);
  }
});

// ============== ADMIN ENDPOINTS FOR LOGS ==============

// Get admin info
app.get("/api/admin/info", auth, adminAuth, (req, res) => {
  res.json({ username: req.user.username });
});


// Get logs from Elasticsearch
/*app.get("/api/admin/logs", auth, adminAuth, async (req, res) => {
  try {
    const { eventType, username } = req.query;
    
    console.log("📋 Fetching logs...");
    
    try {
      // Try to query Elasticsearch
      const result = await esClient.search({
        index: 'socialsync-logs-*',
        body: {
          query: { match_all: {} },
          sort: [{ timestamp: { order: 'desc' } }],
          size: 100
        }
      });

      const logs = result.body.hits.hits.map(hit => hit._source);
      console.log("✅ ES logs found:", logs.length);
      return res.json({ logs });
    } catch (esErr) {
      console.log("⚠️ ES not available, returning mock data");
      // Return mock data if ES is down
      return res.json({
        logs: [
          {
            eventType: "LOGIN",
            username: "admin",
            description: "User logged in",
            timestamp: new Date(),
            priority: "low",
            metadata: { device: "Chrome", ip: "127.0.0.1" }
          },
          {
            eventType: "POST_CREATED",
            username: "admin",
            description: "User created a post",
            timestamp: new Date(),
            priority: "low",
            metadata: { postId: "123" }
          }
        ]
      });
    }
  } catch (error) {
    console.error('Logs error:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});*/

app.get("/api/admin/logs", auth, adminAuth, async (req, res) => {
  try {
    const { eventType, username } = req.query;
    console.log("📋 Fetching logs with filters:", { eventType, username });

    const must = [];

    if (eventType) {
      must.push({ match_phrase: { eventType } });
    }
    if (username) {
      must.push({ match_phrase: { username } });
    }

    const esQuery = must.length > 0 ? { bool: { must } } : { match_all: {} };

    try {
      const result = await esClient.search({
        index: 'socialsync-logs-*',
        body: {
          query: esQuery,
          sort: [{ timestamp: { order: 'desc' } }],
          size: 100
        }
      });

      // FIX: Handle the response structure properly
      let logs = [];
      
      // The response could be result.body.hits.hits OR result.hits.hits
      const hits = result?.body?.hits?.hits || result?.hits?.hits || [];
      
      logs = hits.map(hit => hit._source || hit);

      console.log("✅ ES logs found:", logs.length);
      return res.json({ logs });
    } catch (esErr) {
      console.error("❌ Elasticsearch error:", esErr.message);
      return res.json({
        logs: [],
        error: "Elasticsearch error",
        details: esErr.message
      });
    }
  } catch (error) {
    console.error('❌ Logs endpoint error:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});
// Add after the other admin endpoints
app.get("/api/admin/test-log", auth, adminAuth, async (req, res) => {
  try {
    console.log("🧪 Sending test log...");
   
    // Wait a second
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    res.json({ message: 'Test log sent. Check Logstash logs with: docker-compose logs logstash --tail=20' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get statistics
app.get("/api/admin/stats", auth, adminAuth, async (req, res) => {
  try {
    try {
      const result = await esClient.search({
        index: 'socialsync-logs-*',
        body: {
          aggs: {
            by_event: { 
              terms: { 
                field: 'eventType.keyword',  // Use .keyword for exact match
                size: 20 
              } 
            },
            logins: { 
              filter: { 
                term: { 'eventType.keyword': 'LOGIN' } 
              } 
            }
          },
          size: 0
        }
      });

      const totalUsers = await User.countDocuments();
      const totalPosts = await Post.countDocuments();

      // Handle response structure
      const aggregations = result?.body?.aggregations || result?.aggregations || {};
      
      return res.json({
        totalLogins: aggregations.logins?.doc_count || 0,
        totalUsers,
        totalPosts,
        postsToday: 0,
        totalEngagement: 0,
        highPriorityEvents: 0,
        topEvents: (aggregations.by_event?.buckets || []).map(b => ({
          eventType: b.key,
          count: b.doc_count
        }))
      });
    } catch (esErr) {
      console.error("⚠️ ES error in stats:", esErr.message);
      const totalUsers = await User.countDocuments();
      const totalPosts = await Post.countDocuments();
      
      return res.json({
        totalLogins: 0,
        totalUsers,
        totalPosts,
        postsToday: 0,
        totalEngagement: 0,
        highPriorityEvents: 0,
        topEvents: []
      });
    }
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Get users
app.get("/api/admin/users", auth, adminAuth, async (req, res) => {
  try {
    console.log("📊 Fetching all users for admin panel...");
    
    // ✅ FIX: Sort by createdAt descending (newest first) and remove/increase limit
    const users = await User.find()
      .select("username displayName followersCount followingCount createdAt")
      .sort({ createdAt: -1 }) // ✅ Newest users first
      .limit(100) // ✅ Increased from 20 to 100
      .lean();
    
    console.log(`✅ Found ${users.length} users`);
    
    const usersWithPosts = await Promise.all(users.map(async (user) => {
      const postsCount = await Post.countDocuments({ userId: user._id });
      return {
        _id: user._id,
        username: user.username,
        displayName: user.displayName || user.username,
        followersCount: user.followersCount || 0,
        followingCount: user.followingCount || 0,
        postsCount,
        createdAt: user.createdAt // Include for debugging
      };
    }));

    console.log("📤 Sending users to admin panel:", usersWithPosts.length);
    res.json({ users: usersWithPosts });
  } catch (error) {
    console.error('❌ Admin users endpoint error:', error);
    res.status(500).json({ error: 'Failed to fetch users', details: error.message });
  }
});

// Get active users
/*app.get("/api/admin/users", auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find()
      .select("username displayName followersCount followingCount")
      .limit(20);
    
    const usersWithPosts = await Promise.all(users.map(async (user) => {
      const postsCount = await Post.countDocuments({ userId: user._id });
      return {
        ...user.toObject(),
        postsCount
      };
    }));

    res.json({ users: usersWithPosts });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});*/


//logout route 
// LOGOUT
app.post("/api/auth/logout", auth, async (req, res) => {
  try {
    await logplease(req, 'LOGOUT', 'User logged out', {
      userId: req.user._id,
      username: req.user.username,
    });

    res.json({ message: "Logged out successfully" });
  } catch (err) {
    console.error("Logout error:", err);
    res.status(500).json({ message: "Server error" });
  }
});
