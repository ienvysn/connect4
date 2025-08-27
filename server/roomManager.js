const gameEngine = require("./gameEngine");
const Match = require("./models/Match");
const aiEngine = require("./aiEngine");
const { createClient } = require("redis");
const timers = {};
const TURN_DURATION = 15000;
const RECONNECT_DURATION = 45000;

const redisClient = createClient({ url: "redis://localhost:6379" });
redisClient.on("error", (err) => {
  /* console.log("Redis Client Error", err); */
});
redisClient.connect();

function log(matchId, message) {
  // console.log(`[Match: ${matchId}] ${message}`);
}

async function getMatch(matchId) {
  const cacheKey = `match:${matchId}`;

  try {
    const cachedMatch = await redisClient.get(cacheKey);

    if (cachedMatch) {
      const matchData = JSON.parse(cachedMatch);
      return Match.hydrate(matchData); // Recreate Mongoose model instance
    } else {
      // Cache Miss
      const match = await Match.findOne({ matchId }).lean();
      if (match) {
        await redisClient.set(cacheKey, JSON.stringify(match), { EX: 3600 });
        return Match.hydrate(match);
      }
      return null;
    }
  } catch (error) {
    console.error("Redis error:", error);

    return Match.findOne({ matchId });
  }
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

async function createAIMatch(socketId, username, difficulty) {
  const matchId = Math.random().toString(36).substr(2, 6).toUpperCase();
  const humanPlayer = {
    socketId,
    username,
    playerNumber: 1,
    isReady: true,
  };
  const aiPlayer = {
    socketId: "AI_PLAYER",
    username: "Bot Lav",
    playerNumber: 2,
    isReady: true,
  };
  const newMatch = new Match({
    matchId,
    players: [humanPlayer, aiPlayer],
    board: gameEngine.initBoard(),
    status: "in-progress",
    turn: humanPlayer.socketId,
    difficulty: difficulty,
    isAiMatch: true,
  });
  log(
    matchId,
    `AI Match created by ${username} (${socketId}) with difficulty: ${difficulty}`
  );
  return newMatch.save();
}

async function setPlayerReady(matchId, playerId) {
  const match = await Match.findOne({ matchId });
  if (!match) throw new Error("Match not found.");
  const player = match.players.find((p) => p.socketId === playerId);
  if (player) {
    player.isReady = !player.isReady;
  } else {
    throw new Error(`Player ${playerId} not found in this match.`);
  }
  const allReady =
    match.players.length === 2 && match.players.every((p) => p.isReady);
  if (allReady) {
    match.status = "countdown";
  } else if (match.status === "countdown") {
    match.status = "waiting";
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
  return match.save();
}
// In server/roomManager.js
async function applyMove(io, matchId, playerId, column) {
  const match = await Match.findOne({ matchId });
  if (!match) throw new Error("No match Found");
  if (match.turn !== playerId || match.winner) return null;

  const player = match.players.find((p) => p.socketId === playerId);
  if (player) player.missedTurnCount = 0;

  const moveResult = gameEngine.applyMove(
    match.board,
    player.playerNumber,
    column
  );
  if (!moveResult) return null;

  match.board = moveResult.board;
  let isGameOver = false;

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
    isGameOver = true;
  } else if (gameEngine.isDraw(match.board)) {
    match.winner = "draw";
    match.status = "finished";
    match.reasonForWin = "draw";
    isGameOver = true;
  } else {
    const nextPlayer = match.players.find((p) => p.socketId !== playerId);
    match.turn = nextPlayer.socketId;
  }

  await match.save();
  await redisClient.set(`match:${matchId}`, JSON.stringify(match.toObject()), {
    EX: 3600,
  });

  const winnerPlayer = match.players.find((p) => p.socketId === match.winner);
  const winnerUsername =
    match.winner === "draw" ? "draw" : winnerPlayer?.username;

  const messagePayload = {
    board: match.board,
    nextTurn: match.turn,
    winner: match.winner,
    winnerUsername: winnerUsername,
    lastMove: { row: moveResult.row, col: moveResult.col },
  };

  if (match.turn === "AI_PLAYER" && !isGameOver) {
    messagePayload.type = "board_update";
    io.to(matchId).emit("message", messagePayload);

    startTurnTimer(io, matchId);
    const thinkTime = Math.random() * 6000 + 2000;

    setTimeout(async () => {
      try {
        const currentMatch = await Match.findOne({ matchId });
        if (
          currentMatch.status !== "in-progress" ||
          currentMatch.turn !== "AI_PLAYER"
        )
          return;
        const bestMove = aiEngine.findBestMove(
          currentMatch.board,
          currentMatch.difficulty
        );
        if (bestMove !== null) {
          await applyMove(io, matchId, "AI_PLAYER", bestMove);
        }
      } catch (error) {
        console.error(`[Match: ${matchId}] Error in AI turn:`, error);
      }
    }, thinkTime);
    return match;
  }

  messagePayload.type = isGameOver ? "game_over" : "board_update";
  io.to(matchId).emit("message", messagePayload);

  if (isGameOver) {
    stopTurnTimer(matchId);
    await redisClient.del(`match:${matchId}`);
  } else {
    startTurnTimer(io, matchId);
  }
  return match;
}

function startTurnTimer(io, matchId) {
  if (timers[matchId]) clearTimeout(timers[matchId]);
  io.to(matchId).emit("message", {
    type: "timer_start",
    duration: TURN_DURATION / 1000,
  });
  timers[matchId] = setTimeout(async () => {
    try {
      const match = await Match.findOne({ matchId });
      if (!match || match.status !== "in-progress") return;
      const currentTurnPlayer = match.players.find(
        (p) => p.socketId === match.turn
      );
      currentTurnPlayer.missedTurnCount++;
      if (currentTurnPlayer.missedTurnCount >= 2) {
        const winner = match.players.find((p) => p.socketId !== match.turn);
        match.winner = winner.socketId;
        match.status = "finished";
        match.reasonForWin = "missed_turns";
        await match.save();
        io.to(matchId).emit("message", {
          type: "game_over",
          winner: winner.socketId,
          winnerUsername: winner.username,
          board: match.board,
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
    clearTimeout(timers[matchId]);
    delete timers[matchId];
  }
}

async function handleDisconnect(io, socketId) {
  const match = await Match.findOne({
    "players.socketId": socketId,
    status: "in-progress",
  });
  if (!match) return;
  if (match.isAiMatch) return;

  const player = match.players.find((p) => p.socketId === socketId);
  if (player) {
    player.status = "offline";
    player.disconnectedAt = new Date();
    await match.save();
    setTimeout(() => {
      io.to(match.matchId).emit("message", { type: "opponent_disconnected" });
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
        io.to(updatedMatch.matchId).emit("message", {
          type: "game_over",
          winner: winner.socketId,
          winnerUsername: winner.username,
          board: updatedMatch.board,
        });
        stopTurnTimer(updatedMatch.matchId);
      }
    }, RECONNECT_DURATION);
  }
}

async function handleResignation(io, matchId, playerId) {
  const match = await Match.findOne({ matchId });
  if (!match) return;
  const winner = match.players.find((p) => p.socketId !== playerId);
  match.winner = winner.socketId;
  match.status = "finished";
  match.reasonForWin = "resignation";
  await match.save();
  io.to(matchId).emit("message", {
    type: "game_over",
    winner: winner.socketId,
    winnerUsername: winner.username,
    board: match.board,
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
  createAIMatch,
};
