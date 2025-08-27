const roomManager = require("./roomManager");
const Match = require("./models/Match");

function registerSocketHandlers(io, socket) {
  socket.on("create_match", async ({ username }) => {
    try {
      const match = await roomManager.createMatch(socket.id, username);
      socket.join(match.matchId);
      socket.emit("message", { type: "match_created", matchId: match.matchId });
    } catch (error) {
      console.error(`[Event: create_match] Error for ${socket.id}:`, error);
      socket.emit("message", {
        type: "error",
        error: "Could not create match.",
      });
    }
  });

  socket.on("create_ai_match", async ({ username, difficulty }) => {
    try {
      const match = await roomManager.createAIMatch(
        socket.id,
        username,
        difficulty
      );
      socket.join(match.matchId);
      socket.emit("message", {
        type: "match_created",
        matchId: match.matchId,
      });
      io.to(match.matchId).emit("message", { type: "game_state", match });
    } catch (error) {
      console.error(`[Event: create_ai_match] Error for ${socket.id}:`, error);
      socket.emit("message", {
        type: "error",
        error: "Could not create AI match.",
      });
    }
  });

  socket.on("join_match", async ({ matchId, username }) => {
    try {
      const match = await roomManager.joinMatch(matchId, socket.id, username);
      socket.join(matchId);
      io.to(matchId).emit("message", { type: "game_state", match });
    } catch (error) {
      console.error(
        `[Event: join_match] Error for ${socket.id} joining ${matchId}:`,
        error
      );
      socket.emit("message", { type: "error", error: error.message });
    }
  });

  socket.on("player_ready", async ({ matchId }) => {
    try {
      let match = await Match.findOne({ matchId });
      if (match) {
        socket.join(matchId);
        const stalePlayer = match.players.find(
          (p) => !io.sockets.sockets.get(p.socketId) && p.socketId !== socket.id
        );

        if (stalePlayer) {
          if (match.turn === stalePlayer.socketId) {
            match.turn = socket.id;
          }
          stalePlayer.socketId = socket.id;
          stalePlayer.status = "online";
          stalePlayer.disconnectedAt = null;
          await match.save();
          match = await Match.findOne({ matchId });

          if (match.players.length === 2 && match.status === "in-progress") {
            io.to(matchId).emit("message", { type: "opponent_reconnected" });
          }
        }
        io.to(matchId).emit("message", { type: "game_state", match });
      } else {
        socket.emit("message", { type: "error", error: "Match not found." });
      }
    } catch (error) {
      console.error(
        `[Event: player_ready] Error for ${socket.id} in ${matchId}:`,
        error
      );
    }
  });

  socket.on("player_set_ready", async ({ matchId }) => {
    try {
      let match = await roomManager.setPlayerReady(matchId, socket.id);
      io.to(matchId).emit("message", { type: "game_state", match });

      if (match.status === "countdown") {
        io.to(matchId).emit("message", {
          type: "countdown_start",
          duration: 3,
        });
        setTimeout(async () => {
          const finalMatch = await Match.findOne({ matchId });
          if (!finalMatch || finalMatch.status !== "countdown") return;
          finalMatch.status = "in-progress";
          finalMatch.turn = finalMatch.players[0].socketId;
          await finalMatch.save();
          io.to(matchId).emit("message", {
            type: "game_state",
            match: finalMatch,
          });

          roomManager.startTurnTimer(io, matchId);
        }, 3000);
      }
    } catch (error) {
      console.error(
        `[Event: player_set_ready] Error for ${socket.id} in ${matchId}:`,
        error
      );
    }
  });

  socket.on("make_move", async ({ matchId, column }) => {
    try {
      const match = await roomManager.applyMove(io, matchId, socket.id, column);
      if (!match) {
        socket.emit("message", { type: "error", error: "Invalid move." });
      }
    } catch (error) {
      console.error(
        `[Event: make_move] Error for ${socket.id} in ${matchId}:`,
        error
      );
      socket.emit("message", { type: "error", error: error.message });
    }
  });

  socket.on("resign", ({ matchId }) => {
    console.log(`[Event: resign] Socket: ${socket.id}, Match: ${matchId}`);
    roomManager.handleResignation(io, matchId, socket.id);
  });

  socket.on("disconnect", () => {
    console.log(`[Socket Disconnected] ID: ${socket.id}`);
    roomManager.handleDisconnect(io, socket.id);
  });
}

module.exports = registerSocketHandlers;
