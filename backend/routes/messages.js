// routes/messages.js - FIXED: Sorting, Duplicates, Notifications, and Logging
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

// adjust paths if your models live elsewhere
const User = require("../models/User");
const Message = require("../models/Message");
const Notification = require("../models/Notification");
const logger = require("../services/logger"); // ✅ added logger import

// helper auth middleware (minimal) - FIXED
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || "change_this";

async function auth(req, res, next) {
  try {
    const ah = req.headers.authorization;
    if (!ah || !ah.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing token" });
    }

    const token = ah.slice(7);

    console.log(
      "🔐 Messages route - Token received:",
      token.substring(0, 30) + "..."
    );

    const payload = jwt.verify(token, JWT_SECRET);

    console.log("🔐 Messages route - Decoded payload:", payload);

    // ✅ FIXED: Accept all common JWT claim names including 'sub'
    req.userId = payload.userId || payload.id || payload._id || payload.sub;

    if (!req.userId) {
      console.error("❌ Token payload missing user ID. Payload:", payload);
      return res.status(401).json({ error: "Invalid token payload" });
    }

    console.log("✅ Messages route - User ID extracted:", req.userId);

    // optional: load user doc
    req.user = await User.findById(req.userId).select("-passwordHash");

    if (!req.user) {
      console.error("❌ User not found for ID:", req.userId);
      return res.status(401).json({ error: "User not found" });
    }

    console.log("✅ Messages route - User loaded:", req.user.username);

    next();
  } catch (err) {
    console.error("❌ Auth error in messages route:", err.message);
    return res.status(401).json({ error: "Invalid token" });
  }
}

/**
 * GET /api/search-users?q=term
 * Search users by username or displayName (case-insensitive)
 */
router.get("api/search-users", auth, async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (!q) return res.json({ results: [] });

    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const users = await User.find({
      $or: [{ username: regex }, { displayName: regex }, { email: regex }],
    })
      .limit(25)
      .select("username displayName avatarUrl");

    res.json({ results: users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Search failed" });
  }
});

/**
 * GET /api/conversations
 * List conversations for current user (aggregated from messages)
 * ✅ FIXED: Proper sorting by time + no duplicates
 */
router.get("/", auth, async (req, res) => {
  try {
    const myId = new mongoose.Types.ObjectId(req.userId);

    const agg = await Message.aggregate([
      { $match: { $or: [{ sender: myId }, { recipients: myId }] } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$conversationId",
          lastText: { $first: "$text" },
          lastTime: { $first: "$createdAt" },
          senderId: { $first: "$sender" },
          recipients: { $first: "$recipients" },
        },
      },
    ]);

    // Build conversation objects
    const convs = await Promise.all(
      agg.map(async (c) => {
        const allIds = [c.senderId, ...c.recipients].map((id) => String(id));
        const otherId = allIds.find((id) => id !== String(myId));
        if (!otherId) return null;

        const otherUser = await User.findById(otherId).select(
          "username displayName avatarUrl"
        );
        if (!otherUser) return null;

        // ⭐ unread count
        const unreadCount = await Message.countDocuments({
          conversationId: c._id,
          recipients: myId,
          readBy: { $ne: myId },
        });

        return {
          conversationId: c._id,
          with: {
            _id: otherUser._id,
            username: otherUser.username,
            displayName: otherUser.displayName || otherUser.username,
            avatarUrl: otherUser.avatarUrl,
          },
          lastMessage: {
            text: c.lastText,
            createdAt: c.lastTime,
          },
          unreadCount, // ⭐ added
        };
      })
    );

    res.json({
      conversations: convs
        .filter(Boolean)
        .sort(
          (a, b) =>
            new Date(b.lastMessage.createdAt) -
            new Date(a.lastMessage.createdAt)
        ),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/conversations/user/:username
 * Load all messages between current user and target username (1:1).
 */
router.get("/user/:username", auth, async (req, res) => {
  try {
    const myId = new mongoose.Types.ObjectId(req.userId);
    const username = req.params.username;

    const target = await User.findOne({ username }).select(
      "_id username displayName avatarUrl"
    );
    if (!target) {
      return res.status(404).json({ error: "User not found" });
    }

    const msgs = await Message.find({
      $or: [
        { sender: myId, recipients: target._id },
        { sender: target._id, recipients: myId },
      ],
    })
      .populate("sender", "_id username displayName avatarUrl")
      .sort({ createdAt: 1 });

    // ⭐ Mark incoming messages as READ
    const updateResult = await Message.updateMany(
      {
        sender: target._id,
        recipients: myId,
        readBy: { $ne: myId },
      },
      {
        $addToSet: { readBy: myId },
      }
    );

    // ✅ Log that messages were read (if any updated)
    if (updateResult.modifiedCount > 0) {
      await logger.logFromRequest(req, {
        eventType: "MESSAGE_READ",
        description: "User read messages in a conversation",
        metadata: {
          withUserId: target._id,
          withUsername: target.username,
          modifiedCount: updateResult.modifiedCount,
        },
      });
    }

    res.json({
      with: target,
      messages: msgs,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/conversations/user/:username/messages
 * Send message to username. Body: { text, attachments? }
 * ✅ FIXED: Create notification for recipient
 * ✅ ADDED: Logging for MESSAGE_SENT and MESSAGE_RECEIVED
 */
router.post(
  "/user/:username/messages",
  auth,
  async (req, res) => {
    try {
      const myId = new mongoose.Types.ObjectId(req.userId);
      const { username } = req.params;
      const { text = "", attachments = [] } = req.body;

      console.log(
        "📤 Sending message to:",
        username,
        "Text:",
        text.substring(0, 50)
      );

      const target = await User.findOne({ username }).select(
        "_id username displayName"
      );
      if (!target) {
        console.log("❌ Target user not found:", username);
        return res.status(404).json({ error: "User not found" });
      }

      // Build conversationId deterministically for 1:1 (sorted pair)
      const idsSorted = [String(myId), String(target._id)].sort();
      const conversationId = `dm:${idsSorted.join(":")}`;

      console.log("📨 Conversation ID:", conversationId);

      const msg = new Message({
        conversationId,
        sender: myId,
        recipients: [target._id],
        text,
        attachments,
      });

      await msg.save();

      console.log("✅ Message saved:", msg._id);

      // ✅ Log MESSAGE_SENT (from sender perspective)
      await logger.logFromRequest(req, {
        eventType: "MESSAGE_SENT",
        description: "User sent a direct message",
        metadata: {
          messageId: msg._id,
          conversationId,
          toUserId: target._id,
          toUsername: target.username,
          textPreview: text.substring(0, 100),
        },
      });

      // ✅ Log MESSAGE_RECEIVED (from recipient perspective)
      await logger.logFromRequest(req, {
        eventType: "MESSAGE_RECEIVED",
        description: "User received a direct message",
        userId: target._id,
        username: target.username,
        metadata: {
          messageId: msg._id,
          conversationId,
          fromUserId: myId,
          fromUsername: req.user.username,
          textPreview: text.substring(0, 100),
        },
      });

      // ✅ CREATE NOTIFICATION FOR RECIPIENT
      try {
        await Notification.create({
          user: target._id,
          actor: myId,
          verb: "system", // Using 'system' for messages
          targetType: "Message",
          targetId: msg._id,
          read: false,
        });
        console.log("✅ Notification created for message recipient");
      } catch (notifErr) {
        console.error("❌ Failed to create notification:", notifErr);
        // Don't fail the whole request if notification fails
      }

      // ✅ Emit socket event if socket.io is available
      const io = req.app.get("io");
      if (io) {
        // Find recipient's socket
        const recipientSocket = Array.from(io.sockets.sockets.values()).find(
          (s) => String(s.userId) === String(target._id)
        );

        if (recipientSocket) {
          console.log("✅ Sending real-time notification to recipient socket");

          // Emit new message event
          recipientSocket.emit("new_message", {
            id: msg._id,
            conversationId: conversationId,
            sender: {
              id: myId,
              username: req.user.username,
              displayName: req.user.displayName || req.user.username,
              avatarUrl: req.user.avatarUrl,
            },
            text: msg.text,
            createdAt: msg.createdAt,
          });

          // Emit notification badge update
          recipientSocket.emit("new_notification", {
            type: "message",
            from: req.user.username,
            fromDisplayName: req.user.displayName || req.user.username,
            message: text.substring(0, 100),
          });
        } else {
          console.log("📪 Recipient offline - notification will wait");
        }
      }

      res.json({ ok: true, message: msg });
    } catch (err) {
      console.error("❌ Send message error:", err);
      console.error("Error stack:", err.stack);
      res
        .status(500)
        .json({ error: "Failed to send message", details: err.message });
    }
  }
);

module.exports = router;
