const { Schema, model, Types } = require("mongoose");
const Counter = require("./Counter");

const CommentSchema = new Schema({
  commentId: { type: Number, unique: true },

  post: { type: Types.ObjectId, ref: "Post", required: true },
  author: { type: Types.ObjectId, ref: "User", required: true },

  text: { type: String, required: true },
  parentComment: { type: Types.ObjectId, ref: "Comment", default: null },

  likesCount: { type: Number, default: 0 },
}, { timestamps: true });

// ✅ FIXED: Removed next parameter and next() call
CommentSchema.pre("save", async function() {
  if (this.commentId) return;

  const counter = await Counter.findOneAndUpdate(
    { name: "commentId" },
    { $inc: { value: 1 }},
    { upsert: true, new: true }
  );

  this.commentId = counter.value;
});

module.exports = model("Comment", CommentSchema);