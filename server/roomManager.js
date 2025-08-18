const gameEngine = require("./gameEngine");
const Match = require("./models/Match");

const timers = {};
const TURN_DURATION = 30000;

async function createMatch(socketId, username) {
  const matchId = Math.random().toString(36).substr(2, 6).toUpperCase();
  const player = { socketId, username, playerNumber: 1 };

  const newMatch = new Match({
    matchId,
    players: [player],
    board: gameEngine.initBoard(),
    status: "waiting",
  });

  return newMatch.save(); // save the db
}
async function setPlayerReady(matchId, playerId) {
  const match = await Match.findOne({ matchId });
  if (!match) throw new Error("Match not found.");

  const player = match.players.find((p) => p.socketId === playerId);
  if (player) {
    player.isReady = true;
  }

  // Check if all players are ready
  const allReady =
    match.players.length === 2 && match.players.every((p) => p.isReady);
  if (allReady) {
    match.status = "countdown";
  }

  await match.save();
  return match;
}
async function joinMatch(matchId, socketId, username) {
  const match = await Match.findOne({ matchId: matchId.toUpperCase() }); //find match from db

  if (!match) throw new Error("Match Not found");
  if (match.players.length >= 2) throw new Error("Match Full");
  if (match.status !== "waiting")
    throw new Error("This match has already started.");

  // add new player in the match
  const player = { socketId, username, playerNumber: 2 };
  match.players.push(player);
  match.status = "in-progress";
  match.turn = match.players[0].socketId;
  return match.save(); // save the db
}

async function applyMove(matchId, playerId, column) {
  const match = await Match.findOne({ matchId });
  if (!match) throw new Error("No match Found");

  if (match.turn !== playerId || match.winner) {
    throw new Error("Invalid move: Not your turn or game is over.");
  }

  const player = match.players.find((p) => p.socketId === playerId);
  const moveResult = gameEngine.applyMove(
    match.board,
    player.playerNumber,
    column
  );

  if (!moveResult) return null; // Column is full, invalid move

  match.board = moveResult.board; // Update board state

  // Check for win or draw
  if (
    gameEngine.checkWin(
      match.board,
      moveResult.row,
      moveResult.col,
      player.playerNumber
    )
  ) {
    match.winner = playerId;
    match.status = "finished";
  } else if (gameEngine.isDraw(match.board)) {
    match.winner = "draw";
    match.status = "finished";
  } else {
    // Switch turn to the other player
    const nextPlayer = match.players.find((p) => p.socketId !== playerId);
    match.turn = nextPlayer.socketId;
  }

  // Mark the board as modified for Mongoose to save it correctly
  match.markModified("board");
  await match.save();
  return match;
}

function startTurnTimer(io, matchId) {
  // Clear any previous timer for this match to prevent duplicates
  if (timers[matchId]) {
    clearTimeout(timers[matchId]);
  }

  // Notify  countdown to both
  io.to(matchId).emit("message", {
    type: "timer_start",
    duration: TURN_DURATION / 1000,
  });

  timers[matchId] = setTimeout(async () => {
    try {
      const match = await Match.findOne({ matchId });

      if (!match || match.status !== "in-progress") return;

      console.log(`Timer expired for ${match.turn} in match ${matchId}`);

      // Switch turn to the other player
      const currentTurnPlayerId = match.turn;
      const nextPlayer = match.players.find(
        (p) => p.socketId !== currentTurnPlayerId
      );
      match.turn = nextPlayer.socketId;
      await match.save();

      // Notify players that the turn was switched due to timeout
      io.to(matchId).emit("message", {
        type: "turn_switch_timer",
        board: match.board,
        nextTurn: match.turn,
      });

      // Start the timer for the next player's turn
      startTurnTimer(io, matchId);
    } catch (error) {
      console.error(`Error in timer for match ${matchId}:`, error);
    }
  }, TURN_DURATION);
}

function stopTurnTimer(matchId) {
  if (timers[matchId]) {
    clearTimeout(timers[matchId]);
    delete timers[matchId];
  }
}
module.exports = {
  createMatch,
  joinMatch,
  setPlayerReady,
  applyMove,
  startTurnTimer,
  stopTurnTimer,
};
