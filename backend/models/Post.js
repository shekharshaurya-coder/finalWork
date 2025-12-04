// models/Post.js - COMPLETE VERSION
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
  comments: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    username: String,
    text: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }]
}, { 
  timestamps: true 
});

// Indexes to improve query performance
postSchema.index({ createdAt: -1 }); // For sorting posts by time
postSchema.index({ userId: 1 }); // For fetching posts by a specific user

// ✅ Pre-save hook for auto-increment
postSchema.pre("save", async function() {
  // Skip if postId already exists
  if (this.postId) return;

  // Get next counter value
  const counter = await Counter.findOneAndUpdate(
    { name: "postId" },
    { $inc: { value: 1 }},
    { upsert: true, new: true }
  );

  // Assign the counter value to postId
  this.postId = counter.value;
});

module.exports = mongoose.model('Post', postSchema);