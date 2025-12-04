const { Schema, model, Types } = require("mongoose");
const Counter = require("./Counter");

const NotificationSchema = new Schema({
  notificationId: { type: Number, unique: true },

  user: { type: Types.ObjectId, ref: "User", required: true },
  actor: { type: Types.ObjectId, ref: "User" },

  verb: {
    type: String,
    enum: ["like", "comment", "follow", "mention", "reply", "system"],
    required: true
  },

  targetType: String,
  targetId: Types.ObjectId,
  read: { type: Boolean, default: false },

}, { timestamps: true });

// ✅ FIXED: Removed next parameter and next() call
NotificationSchema.pre("save", async function() {
  if (this.notificationId) return;

  const counter = await Counter.findOneAndUpdate(
    { name: "notificationId" },
    { $inc: { value: 1 }},
    { upsert: true, new: true }
  );

  this.notificationId = counter.value;
});

module.exports = model("Notification", NotificationSchema);