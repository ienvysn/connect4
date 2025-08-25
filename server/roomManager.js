const gameEngine = require("./gameEngine");
const Match = require("./models/Match");

const timers = {};
const TURN_DURATION = 15000;
const RECONNECT_DURATION = 45000;

// --- Helper function for logging ---
function log(matchId, message) {
  console.log(`[Match: ${matchId}] ${message}`);
}

async function createMatch(socketId, username) {
  const matchId = Math.random().toString(36).substr(2, 6).toUpperCase();
  const player = { socketId, username, playerNumber: 1, isReady: false };

  const newMatch = new Match({
    matchId,
    players: [player],
    board: gameEngine.initBoard(),
    status: "waiting",
  });
  log(matchId, `Match created by ${username} (${socketId})`);
  return newMatch.save();
}

async function setPlayerReady(matchId, playerId) {
  log(matchId, `Attempting to set ready for player ${playerId}`);
  const match = await Match.findOne({ matchId });
  if (!match) {
    console.error(`[Match: ${matchId}] setPlayerReady Error: Match not found.`);
    throw new Error("Match not found.");
  }

  const player = match.players.find((p) => p.socketId === playerId);
  if (player) {
    player.isReady = !player.isReady;
    log(
      matchId,
      `Player ${player.username} (${playerId}) is now ready: ${player.isReady}`
    );
  } else {
    console.error(
      `[Match: ${matchId}] setPlayerReady Error: Player with ID ${playerId} not found.`
    );
    throw new Error(`Player ${playerId} not found in this match.`);
  }

  const allReady =
    match.players.length === 2 && match.players.every((p) => p.isReady);
  if (allReady) {
    match.status = "countdown";
    log(matchId, `All players are ready. Status changed to 'countdown'.`);
  } else {
    if (match.status === "countdown") {
      match.status = "waiting";
      log(matchId, `A player un-readied. Status reverted to 'waiting'.`);
    }
  }

  await match.save();
  return match;
}

async function joinMatch(matchId, socketId, username) {
  const match = await Match.findOne({ matchId: matchId.toUpperCase() });

  if (!match) throw new Error("Match Not found");
  if (match.players.length >= 2) throw new Error("Match Full");
  if (match.status !== "waiting")
    throw new Error("This match has already started.");

  const player = { socketId, username, playerNumber: 2, isReady: false };
  match.players.push(player);

  log(match.matchId, `${username} (${socketId}) joined match.`);
  return match.save();
}

async function applyMove(matchId, playerId, column) {
  const match = await Match.findOne({ matchId });
  if (!match) throw new Error("No match Found");

  if (match.turn !== playerId || match.winner) {
    throw new Error("Invalid move: Not your turn or game is over.");
  }

  const player = match.players.find((p) => p.socketId === playerId);
  log(
    matchId,
    `Player ${player.username} made a move in column ${column}. Resetting missed turn count.`
  );
  player.missedTurnCount = 0;
  const moveResult = gameEngine.applyMove(
    match.board,
    player.playerNumber,
    column
  );

  if (!moveResult) return null;

  match.board = moveResult.board;

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
    match.reasonForWin = "victory";
    log(matchId, `Game over. Winner: ${player.username} by victory.`);
  } else if (gameEngine.isDraw(match.board)) {
    match.winner = "draw";
    match.status = "finished";
    match.reasonForWin = "draw";
    log(matchId, `Game over. It's a draw.`);
  } else {
    const nextPlayer = match.players.find((p) => p.socketId !== playerId);
    match.turn = nextPlayer.socketId;
    log(matchId, `Turn switched to ${nextPlayer.username}.`);
  }

  match.markModified("board");
  await match.save();
  return match;
}

function startTurnTimer(io, matchId) {
  if (timers[matchId]) {
    clearTimeout(timers[matchId]);
  }
  log(matchId, `Starting 15s turn timer.`);
  io.to(matchId).emit("message", {
    type: "timer_start",
    duration: TURN_DURATION / 1000,
  });

  timers[matchId] = setTimeout(async () => {
    try {
      const match = await Match.findOne({ matchId });

      if (!match || match.status !== "in-progress") {
        log(
          matchId,
          `Turn timer expired, but match is no longer in progress. Aborting.`
        );
        return;
      }

      const currentTurnPlayer = match.players.find(
        (p) => p.socketId === match.turn
      );
      currentTurnPlayer.missedTurnCount++;
      log(
        matchId,
        `Timer expired for ${currentTurnPlayer.username}. Missed turn count: ${currentTurnPlayer.missedTurnCount}.`
      );

      if (currentTurnPlayer.missedTurnCount >= 2) {
        const winner = match.players.find((p) => p.socketId !== match.turn);
        match.winner = winner.socketId;
        match.status = "finished";
        match.reasonForWin = "missed_turns";
        await match.save();

        log(
          matchId,
          `Game over. ${winner.username} wins due to opponent missing 2 turns.`
        );
        io.to(matchId).emit("message", {
          type: "game_over",
          winner: winner.socketId,
          winnerUsername: winner.username,
          board: match.board, // <-- FIX: Added board state
        });
        stopTurnTimer(matchId);
        return;
      }

      const nextPlayer = match.players.find(
        (p) => p.socketId !== currentTurnPlayer.socketId
      );
      match.turn = nextPlayer.socketId;
      await match.save();

      io.to(matchId).emit("message", {
        type: "turn_switch_timer",
        board: match.board,
        nextTurn: match.turn,
      });

      startTurnTimer(io, matchId);
    } catch (error) {
      console.error(`[Match: ${matchId}] Error in turn timer:`, error);
    }
  }, TURN_DURATION);
}

function stopTurnTimer(matchId) {
  if (timers[matchId]) {
    log(matchId, `Stopping turn timer.`);
    clearTimeout(timers[matchId]);
    delete timers[matchId];
  }
}

async function handleDisconnect(io, socketId) {
  const match = await Match.findOne({
    "players.socketId": socketId,
    status: "in-progress",
  });
  if (!match) {
    console.log(
      `[Disconnect] Socket ${socketId} disconnected, but was not in an active match.`
    );
    return;
  }

  const player = match.players.find((p) => p.socketId === socketId);
  if (player) {
    player.status = "offline";
    player.disconnectedAt = new Date();
    await match.save();
    log(
      match.matchId,
      `Player ${player.username} disconnected. Starting 45s reconnect timer.`
    );

    setTimeout(() => {
      log(
        match.matchId,
        `3s debounce passed. Notifying opponent of disconnect.`
      );
      io.to(match.matchId).emit("message", {
        type: "opponent_disconnected",
      });
    }, 3000);

    setTimeout(async () => {
      const updatedMatch = await Match.findOne({ matchId: match.matchId });
      const stillOfflinePlayer = updatedMatch.players.find(
        (p) => p.status === "offline"
      );

      if (stillOfflinePlayer) {
        const winner = updatedMatch.players.find(
          (p) => p.socketId !== stillOfflinePlayer.socketId
        );
        updatedMatch.winner = winner.socketId;
        updatedMatch.status = "finished";
        updatedMatch.reasonForWin = "disconnect";
        await updatedMatch.save();

        log(
          match.matchId,
          `Reconnect timer expired for ${stillOfflinePlayer.username}. ${winner.username} wins by opponent disconnect.`
        );
        io.to(updatedMatch.matchId).emit("message", {
          type: "game_over",
          winner: winner.socketId,
          winnerUsername: winner.username,
          board: updatedMatch.board,
        });
        stopTurnTimer(updatedMatch.matchId);
      } else {
        log(
          match.matchId,
          `Reconnect timer expired, but player has already reconnected. No action taken.`
        );
      }
    }, RECONNECT_DURATION);
  }
}

async function handleResignation(io, matchId, playerId) {
  const match = await Match.findOne({ matchId });
  if (!match) return;

  const resigningPlayer = match.players.find((p) => p.socketId === playerId);
  const winner = match.players.find((p) => p.socketId !== playerId);
  match.winner = winner.socketId;
  match.status = "finished";
  match.reasonForWin = "resignation";
  await match.save();

  log(
    matchId,
    `Player ${resigningPlayer.username} resigned. ${winner.username} wins.`
  );
  io.to(matchId).emit("message", {
    type: "game_over",
    winner: winner.socketId,
    winnerUsername: winner.username,
    board: match.board, // <-- FIX: Added board state
  });
  stopTurnTimer(matchId);
}

module.exports = {
  createMatch,
  joinMatch,
  setPlayerReady,
  applyMove,
  startTurnTimer,
  stopTurnTimer,
  handleDisconnect,
  handleResignation,
};
