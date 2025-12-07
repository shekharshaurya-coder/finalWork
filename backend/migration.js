// Run this once to sync existing data
// migration-sync-comments.js

const mongoose = require('mongoose');
const Post = require('./models/Post');
const Comment = require('./models/Comment');

async function syncCommentCounts() {
  try {
    await mongoose.connect(
        process.env.MONGO_URI || 'mongodb://localhost:27017/newsocial',
    );
    console.log('🔗 Connected to database');

    const posts = await Post.find({});
    console.log(`📊 Found ${posts.length} posts to update`);

    for (const post of posts) {
      // Count actual comments for this post
      const actualCount = await Comment.countDocuments({ post: post._id });
      
      // Update the post's commentCount
      post.commentCount = actualCount;
      
      // Also sync the comments array if needed
      const commentIds = await Comment.find({ post: post._id }).select('_id');
      post.comments = commentIds.map(c => c._id);
      
      await post.save();
      
      console.log(`✅ Updated post ${post._id}: ${actualCount} comments`);
    }

    console.log('🎉 Migration complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  }
}

syncCommentCounts();