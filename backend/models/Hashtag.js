const { Schema, model } = require("mongoose");
const Counter = require("./Counter");

const HashtagSchema = new Schema({
  hashtagId: { type: Number, unique: true },

  tag: { type: String, required: true, unique: true },
  postsCount: { type: Number, default: 0 },
  lastUsedAt: { type: Date, default: Date.now },
});

// ✅ FIXED: Removed next parameter and next() call
HashtagSchema.pre("save", async function() {
  if (this.hashtagId) return;

  const counter = await Counter.findOneAndUpdate(
    { name: "hashtagId" },
    { $inc: { value: 1 }},
    { upsert: true, new: true }
  );

  this.hashtagId = counter.value;
});

module.exports = model("Hashtag", HashtagSchema);