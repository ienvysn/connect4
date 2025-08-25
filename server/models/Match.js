const mongoose = require("mongoose");

// Defines a player within a match
const playerSchema = new mongoose.Schema({
  socketId: { type: String, required: true },
  username: { type: String, required: true },
  playerNumber: { type: Number, enum: [1, 2], required: true },
  isReady: { type: Boolean, default: false },
  status: {
    type: String,
    enum: ["online", "offline"],
    default: "online",
  },
  disconnectedAt: { type: Date, default: null },
  missedTurnCount: { type: Number, default: 0 },
});

// Defines the main structure for a game match
const matchSchema = new mongoose.Schema({
  matchId: { type: String, required: true, unique: true, index: true },
  players: [playerSchema],
  board: { type: [[Number]], required: true },
  turn: { type: String },
  winner: { type: String, default: null },
  status: {
    type: String,
    enum: ["waiting", "countdown", "in-progress", "finished"],
    default: "waiting",
  },
  reasonForWin: { type: String },
  createdAt: { type: Date, default: Date.now },
});

const Match = mongoose.model("Match", matchSchema);

module.exports = Match;
