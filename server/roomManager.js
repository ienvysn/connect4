const gameEngine = require("./gameEngine");
const Match = require("./models/Match");

const timers = {};
const TURN_DURATION = 30000;

async function createMatch(socketId, username) {
  const matchId = Math.random().toString(36).substr(2, 6).toUpperCase();
  const player = { socketId, username, playerNumber: 1, isReady: false };

  const newMatch = new Match({
    matchId,
    players: [player],
    board: gameEngine.initBoard(),
    status: "waiting",
  });
  console.log(`Match ${matchId} created by ${username} (${socketId})`);
  return newMatch.save(); // save the db
}

async function setPlayerReady(matchId, playerId) {
  console.log(
    `Attempting to set ready for player ${playerId} in match ${matchId}`
  );
  const match = await Match.findOne({ matchId });
  if (!match) {
    console.error(`setPlayerReady Error: Match ${matchId} not found.`);
    throw new Error("Match not found.");
  }

  // For debugging: Log the players currently in the match from the database
  console.log(
    `Found match ${matchId}. Players in DB:`,
    JSON.stringify(match.players.map((p) => p.socketId))
  );

  const player = match.players.find((p) => p.socketId === playerId);
  if (player) {
    // Toggle the ready state
    player.isReady = !player.isReady;
    console.log(
      `Player ${player.username} (${playerId}) in match ${matchId} is now ready: ${player.isReady}`
    );
  } else {
    // This is a critical error. Throw it to be caught by sockets.js
    console.error(
      `setPlayerReady Error: Player with ID ${playerId} not found in match ${matchId}.`
    );
    throw new Error(`Player ${playerId} not found in this match.`);
  }

  // Check if all players are ready
  const allReady =
    match.players.length === 2 && match.players.every((p) => p.isReady);
  if (allReady) {
    match.status = "countdown";
    console.log(
      `All players in match ${matchId} are ready. Starting countdown.`
    );
  } else {
    // If a player un-readies, ensure the status is back to waiting
    if (match.status === "countdown") {
      match.status = "waiting";
    }
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
  const player = { socketId, username, playerNumber: 2, isReady: false };
  match.players.push(player);

  // BUG FIX: Do NOT change the status here. The game should remain in the 'waiting'
  // state until both players have readied up.
  // match.status = "in-progress";
  // match.turn = match.players[0].socketId;

  console.log(`${username} (${socketId}) joined match ${matchId}`);
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
