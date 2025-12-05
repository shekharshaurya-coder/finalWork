// cron/trendingCron.js
const cron = require('node-cron');
const Post = require('../models/Post');
const redis = require('../utils/redisClient');

// Run every 15 seconds
cron.schedule('*/15 * * * * *', async () => {
  try {
    // Aggregate to find top hashtag by number of posts containing it
    const pipeline = [
      { $unwind: '$hashtags' },
      { $group: { _id: '$hashtags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 1 }
    ];

    const res = await Post.aggregate(pipeline);
    if (!res || res.length === 0) {
      // no hashtags
      await redis.del('trending:hashtag');
      await redis.del('trending:posts');
      return;
    }

    const topTag = res[0]._id;

    // Get posts that contain this hashtag, sorted by createdAt desc
    const posts = await Post.find({ hashtags: topTag })
                            .sort({ createdAt: -1 })
                            .limit(100) // limit for safety
                            .lean();

    // Cache topTag and posts in Redis (serialize)
    await redis.set('trending:hashtag', topTag, 'EX', 60 * 5); // 5min fallback TTL
    await redis.set('trending:posts', JSON.stringify(posts), 'EX', 60 * 5);

    console.log(`[TrendingCron] topTag=${topTag} posts=${posts.length}`);
  } catch (err) {
    console.error('[TrendingCron] error:', err);
  }
});
