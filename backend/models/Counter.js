const { Schema, model } = require("mongoose");

const CounterSchema = new Schema({
  name: { type: String, required: true, unique: true },
  value: { type: Number, default: 0 },
});

module.exports = model("Counter", CounterSchema);