// backend/models/User.js
const { Schema, model } = require("mongoose");
const Counter = require("./Counter");

const UserSchema = new Schema(
  {
    userId: { type: Number, unique: true }, // Auto-increment ID

    username: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },

    displayName: { type: String, default: "" },
    bio: { type: String, default: "" },
    avatarUrl: { type: String, default: "" },

    followersCount: { type: Number, default: 0 },
    followingCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// NOTE: async pre-save hooks should NOT call next() — Mongoose expects the async function to resolve/throw.
UserSchema.pre("save", async function () {
  // If updating existing user (userId already set) -> skip increment
  if (this.userId) return;

  // get a new counter value
  const counter = await Counter.findOneAndUpdate(
    { name: "userId" },
    { $inc: { value: 1 } },
    { new: true, upsert: true } // return the updated doc
  );

  if (!counter) {
    // Defensive: if counter somehow not returned, throw to stop saving.
    throw new Error("Failed to generate userId");
  }

  this.userId = counter.value;
  // do not call next(); returning/finishing is enough
});

module.exports = model("User", UserSchema);
