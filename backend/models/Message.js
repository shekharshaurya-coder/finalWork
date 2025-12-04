const { Schema, model, Types } = require("mongoose");
const Counter = require("./Counter");

const MessageSchema = new Schema({
  messageId: { type: Number, unique: true },

  conversationId: { type: String, required: true },

  sender: { type: Types.ObjectId, ref: "User", required: true },
  recipients: [{ type: Types.ObjectId, ref: "User" }],

  text: { type: String, default: "" },
  attachments: [{ url: String, type: String }],

  deliveredTo: [{ type: Types.ObjectId }],
  readBy: [{ type: Types.ObjectId }],
}, { timestamps: true });

// ✅ FIXED: Removed next parameter and next() call
MessageSchema.pre("save", async function() {
  if (this.messageId) return;

  const counter = await Counter.findOneAndUpdate(
    { name: "messageId" },
    { $inc: { value: 1 }},
    { upsert: true, new: true }
  );

  this.messageId = counter.value;
});

module.exports = model("Message", MessageSchema);
