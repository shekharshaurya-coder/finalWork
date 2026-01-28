// backend/middleware/auth.js
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const JWT_SECRET = process.env.JWT_SECRET;

// Validate JWT_SECRET on module load
if (!JWT_SECRET) {
  console.error("❌ CRITICAL: JWT_SECRET is not set in environment");
  console.error("❌ Server cannot start without JWT_SECRET");
  process.exit(1);
}

if (JWT_SECRET.length < 32) {
  console.error("❌ CRITICAL: JWT_SECRET must be at least 32 characters");
  console.error("❌ Current length:", JWT_SECRET.length);
  process.exit(1);
}

// Cache for verified tokens (optional, for performance)
// This prevents repeated DB lookups for the same token
const tokenCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Clean up expired cache entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of tokenCache.entries()) {
    if (now - data.timestamp > CACHE_TTL) {
      tokenCache.delete(token);
    }
  }
}, 10 * 60 * 1000);

async function authMiddleware(req, res, next) {
  try {
    // Extract Authorization header
    const auth = req.headers.authorization;

    if (!auth || !auth.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Missing or invalid authorization header",
        code: "NO_TOKEN",
      });
    }

    const token = auth.split(" ")[1];

    // Validate token format
    if (!token || token.length < 10) {
      return res.status(401).json({
        message: "Invalid token format",
        code: "INVALID_TOKEN_FORMAT",
      });
    }

    // Check token cache first (optional optimization)
    const cached = tokenCache.get(token);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      req.user = cached.user;
      return next();
    }

    // Verify JWT token
    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (jwtErr) {
      // Handle specific JWT errors
      if (jwtErr.name === "TokenExpiredError") {
        return res.status(401).json({
          message: "Token has expired",
          code: "TOKEN_EXPIRED",
        });
      }
      if (jwtErr.name === "JsonWebTokenError") {
        return res.status(401).json({
          message: "Invalid token",
          code: "INVALID_TOKEN",
        });
      }
      throw jwtErr; // Re-throw other errors
    }

    // Debug logging (remove in production)
    if (process.env.NODE_ENV === "development") {
      console.log("🔑 Auth middleware - Token payload:", {
        sub: payload.sub,
        userId: payload.userId,
        username: payload.username,
        exp: payload.exp ? new Date(payload.exp * 1000).toISOString() : "none",
      });
    }

    // Extract user ID from payload (support multiple claim names)
    const userId = payload.sub || payload.userId || payload.id || payload._id;

    if (!userId) {
      console.warn("⚠️ Auth failed - token payload missing user id:", payload);
      return res.status(401).json({
        message: "Invalid token payload - missing user identifier",
        code: "INVALID_PAYLOAD",
      });
    }

    // Fetch user from database
    let user;
    try {
      user = await User.findById(userId).select("-passwordHash").lean();
    } catch (dbErr) {
      console.error("❌ Database error in auth middleware:", dbErr);
      return res.status(500).json({
        message: "Server error during authentication",
        code: "DB_ERROR",
      });
    }

    if (!user) {
      console.warn("⚠️ Auth failed - user not found for ID:", userId);
      return res.status(401).json({
        message: "User not found or has been deleted",
        code: "USER_NOT_FOUND",
      });
    }

    // Check if user account is active (if you have this field)
    if (user.isDeactivated || user.isBanned) {
      return res.status(403).json({
        message: "Account has been deactivated",
        code: "ACCOUNT_DEACTIVATED",
      });
    }

    // Store user in cache (optional optimization)
    tokenCache.set(token, {
      user: user,
      timestamp: Date.now(),
    });

    // Attach user to request object
    // Convert lean object back to Mongoose document-like object
    req.user = {
      _id: user._id,
      id: user._id,
      userId: user._id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      followersCount: user.followersCount || 0,
      followingCount: user.followingCount || 0,
    };

    // Log successful authentication (optional)
    if (process.env.NODE_ENV === "development") {
      console.log("✅ User authenticated:", req.user.username);
    }

    next();
  } catch (err) {
    // Catch any unexpected errors
    console.error("❌ Unexpected error in auth middleware:", err);
    return res.status(500).json({
      message: "Authentication error",
      code: "AUTH_ERROR",
      ...(process.env.NODE_ENV === "development" && {
        details: err.message,
      }),
    });
  }
}

// Optional: Middleware to check if user is admin
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const adminUsernames =
    process.env.ADMIN_USERNAMES?.split(",").map((u) => u.trim()) || [];

  if (!adminUsernames.includes(req.user.username)) {
    return res.status(403).json({
      message: "Admin access required",
      code: "FORBIDDEN",
    });
  }

  next();
}

// Optional: Middleware for optional authentication (doesn't fail if no token)
async function optionalAuth(req, res, next) {
  const auth = req.headers.authorization;

  if (!auth || !auth.startsWith("Bearer ")) {
    req.user = null;
    return next();
  }

  // Reuse the main auth middleware logic
  return authMiddleware(req, res, next);
}

// Export cache stats for monitoring
function getCacheStats() {
  return {
    size: tokenCache.size,
    ttl: CACHE_TTL,
    entries: tokenCache.size,
  };
}

// Clear cache manually if needed
function clearCache() {
  tokenCache.clear();
  console.log("🗑️ Auth token cache cleared");
}

module.exports = authMiddleware;
module.exports.requireAdmin = requireAdmin;
module.exports.optionalAuth = optionalAuth;
module.exports.getCacheStats = getCacheStats;
module.exports.clearCache = clearCache;
