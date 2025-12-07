// models/Post.js - FIXED VERSION
const mongoose = require('mongoose');
const Counter = require("./Counter");

const postSchema = new mongoose.Schema({
  postId: { type: Number, unique: true }, // ✅ AUTO INCREMENT ID
  
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  username: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['text', 'file'],
    default: 'text'
  },
  mediaUrl: {
    type: String,
    default: null
  },
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // ✅ FIXED: Array of Comment ObjectId references
  comments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment'
  }],
  
  // ✅ CRITICAL: Separate count field for display
  commentCount: {
    type: Number,
    default: 0
  },
  
  hashtags: [{
    type: String,
    lowercase: true,
    trim: true
  }]
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes to improve query performance
postSchema.index({ createdAt: -1 }); // For sorting posts by time
postSchema.index({ userId: 1 }); // For fetching posts by a specific user

// ✅ Pre-save hook for auto-increment and hashtags
postSchema.pre("save", async function() {
  // Skip if postId already exists
  if (!this.postId) {
    const counter = await Counter.findOneAndUpdate(
      { name: "postId" },
      { $inc: { value: 1 }},
      { upsert: true, new: true }
    );
    this.postId = counter.value;
  }

  // Extract hashtags from content
  if (this.content && typeof this.content === "string") {
    const tags = Array.from(this.content.matchAll(/#([A-Za-z0-9_]+)/g))
                       .map(m => m[1].toLowerCase());
    this.hashtags = [...new Set(tags)];
  } else {
    this.hashtags = [];
  }
});

module.exports = mongoose.model('Post', postSchema);