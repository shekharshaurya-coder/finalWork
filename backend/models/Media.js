const { Schema, model, Types } = require("mongoose");
const Counter = require("./Counter");

const MediaSchema = new Schema({
  mediaId: { type: Number, unique: true },

  ownerType: { type: String, enum: ["User", "Post", "Message"], required: true },
  ownerId: { type: Types.ObjectId, required: true },

  url: { type: String, required: true },
  storageKey: { type: String, required: true },

  mimeType: String,
  width: Number,
  height: Number,
  duration: Number,
  sizeBytes: Number,

  processed: { type: Boolean, default: false },
}, { timestamps: true });

// ✅ FIXED: Removed next parameter and next() call
MediaSchema.pre("save", async function() {
  if (this.mediaId) return;

  const counter = await Counter.findOneAndUpdate(
    { name: "mediaId" },
    { $inc: { value: 1 }},
    { upsert: true, new: true }
  );

  this.mediaId = counter.value;
});

module.exports = model("Media", MediaSchema);