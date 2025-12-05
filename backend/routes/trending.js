const express = require("express");
const router = express.Router();
const Post = require("../models/Post");

// ================= TRENDING ROUTE =================
router.get("/", async (req, res) => {
  try {
    let posts = await Post.find().sort({ createdAt: -1 }).lean();

    // Filter: Only posts with hashtags
    const hashtagPosts = posts.filter(p =>
      /#\w+/.test(p.content || "")
    );

    // If no hashtag posts exist
    if (!hashtagPosts.length) {
      return res.json({
        hashtag: null,
        posts: []
      });
    }

    // Count usage of all hashtags
    let hashtagCounts = {};
    hashtagPosts.forEach(post => {
      const tags = post.content.match(/#\w+/g) || [];
      tags.forEach(tag => {
        hashtagCounts[tag.toLowerCase()] =
          (hashtagCounts[tag.toLowerCase()] || 0) + 1;
      });
    });

    // Get most used hashtag
    const topTrending = Object.entries(hashtagCounts)
      .sort((a, b) => b[1] - a[1])[0][0];

    // Filter only posts containing trending hashtag
    const trendingPosts = hashtagPosts.filter(post =>
      (post.content || "").toLowerCase().includes(topTrending)
    );

    res.json({
      hashtag: topTrending,
      posts: trendingPosts
    });

  } catch (err) {
    console.error("Trending route error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
