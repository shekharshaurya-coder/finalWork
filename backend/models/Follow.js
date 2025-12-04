const { Schema, model, Types } = require("mongoose");
const Counter = require("./Counter");

const FollowSchema = new Schema({
  followId: { type: Number, unique: true },

  follower: { type: Types.ObjectId, ref: "User", required: true },
  followee: { type: Types.ObjectId, ref: "User", required: true },
  status: { 
    type: String, 
    enum: ['pending', 'accepted'], 
    default: 'accepted'
  }
}, { timestamps: true });

FollowSchema.index({ follower: 1, followee: 1 }, { unique: true });

// ✅ FIXED: Removed next parameter and next() call
FollowSchema.pre("save", async function() {
  if (this.followId) return;

  const counter = await Counter.findOneAndUpdate(
    { name: "followId" },
    { $inc: { value: 1 }},
    { upsert: true, new: true }
  );

  this.followId = counter.value;
});

module.exports = model("Follow", FollowSchema);