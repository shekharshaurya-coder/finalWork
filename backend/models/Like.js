const { Schema, model, Types } = require("mongoose");
const Counter = require("./Counter");

const LikeSchema = new Schema({
  likeId: { type: Number, unique: true },

  post: { type: Types.ObjectId, ref: "Post", required: true },
  user: { type: Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

LikeSchema.index({ post: 1, user: 1 }, { unique: true });

// ✅ FIXED: Removed next parameter and next() call
LikeSchema.pre("save", async function() {
  if (this.likeId) return;

  const counter = await Counter.findOneAndUpdate(
    { name: "likeId" },
    { $inc: { value: 1 }},
    { upsert: true, new: true }
  );

  this.likeId = counter.value;
});

module.exports = model("Like", LikeSchema);