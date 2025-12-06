const cron = require('node-cron');
const Post = require('../models/Post');
const { client } = require('../utils/redisClient'); // get the function
const redis = client(); // get the real Redis client instance

cron.schedule('*/15 * * * * *', async () => {
  try {
    const pipeline = [
      { $unwind: '$hashtags' },
      { $group: { _id: '$hashtags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 1 },
    ];

    const res = await Post.aggregate(pipeline);

    if (!res || res.length === 0) {
      await redis.del('trending:hashtag');
      await redis.del('trending:posts');
      return;
    }

    const topTag = res[0]._id;

    const posts = await Post.find({ hashtags: topTag })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    // Redis v4 syntax: options object
    await redis.set('trending:hashtag', topTag, { EX: 60 * 5 });
    await redis.set('trending:posts', JSON.stringify(posts), { EX: 60 * 5 });

    console.log(`[TrendingCron] topTag=${topTag} posts=${posts.length}`);
  } catch (err) {
    console.error('[TrendingCron] error:', err);
  }
});
