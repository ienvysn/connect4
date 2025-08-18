const mongoose = require("mongoose");

const playerSchema = new mongoose.Schema({
  socketId: { type: String, required: true },
  username: { type: String, required: true },
  playerNumber: { type: Number, enum: [1, 2], required: true },
});

const matchSchema = new mongoose.Schema({
  matchId: { type: String, required: true, unique: true, index: true },
  players: [playerSchema],
  board: { type: [[Number]], required: true },
  turn: { type: String },
  winner: { type: String, default: null },
  status: {
    type: String,
    enum: ["waiting", "in-progress", "finished"],
    default: "waiting",
  },
  createdAt: { type: Date, default: Date.now },
});

const Match = mongoose.model("Match", matchSchema);
module.exports = Match;
