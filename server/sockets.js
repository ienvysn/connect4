const roomManager = require("./roomManager");
const Match = require("./models/Match");

function registerSocketHandlers(io, socket) {
  console.log(`[Socket Connected] ID: ${socket.id}`);

  socket.on("create_match", async ({ username }) => {
    console.log(
      `[Event: create_match] Received from ${socket.id} for user ${username}`
    );
    try {
      const match = await roomManager.createMatch(socket.id, username);
      socket.join(match.matchId);
      socket.emit("message", { type: "match_created", matchId: match.matchId });
    } catch (error) {
      console.error("[Event: create_match] Error:", error);
      socket.emit("message", {
        type: "error",
        error: "Could not create match.",
      });
    }
  });

  socket.on("join_match", async ({ matchId, username }) => {
    console.log(
      `[Event: join_match] Received from ${socket.id} for user ${username} to match ${matchId}`
    );
    try {
      const match = await roomManager.joinMatch(matchId, socket.id, username);
      socket.join(matchId);
      io.to(matchId).emit("message", { type: "game_state", match });
    } catch (error) {
      console.error(
        `[Event: join_match] Error joining match ${matchId}:`,
        error
      );
      socket.emit("message", { type: "error", error: error.message });
    }
  });

  socket.on("player_ready", async ({ matchId }) => {
    console.log(
      `[Event: player_ready] Received from ${socket.id} for match ${matchId}`
    );
    try {
      let match = await Match.findOne({ matchId });
      if (match) {
        socket.join(matchId);

        // Find a player in the match whose socket is no longer active on the server.
        // This handles the redirect case where a player gets a new socket ID.
        const stalePlayer = match.players.find(
          (p) => !io.sockets.sockets.get(p.socketId) && p.socketId !== socket.id
        );

        if (stalePlayer) {
          console.log(
            `[Reconnect] Found stale player ${stalePlayer.username} in match ${matchId}. Updating socket ID from ${stalePlayer.socketId} to ${socket.id}`
          );
          stalePlayer.socketId = socket.id;
          stalePlayer.status = "online";
          stalePlayer.disconnectedAt = null;
          await match.save();
          match = await Match.findOne({ matchId }); // Re-fetch to get the latest state

          // If this was a mid-game reconnect, notify the other player.
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
        `[Event: player_ready] Error on player_ready for match ${matchId}:`,
        error
      );
      socket.emit("message", {
        type: "error",
        error: "Could not retrieve match data.",
      });
    }
  });

  socket.on("player_set_ready", async ({ matchId }) => {
    console.log(
      `[Event: player_set_ready] Received from ${socket.id} for match ${matchId}`
    );
    try {
      let match = await roomManager.setPlayerReady(matchId, socket.id);

      io.to(matchId).emit("message", { type: "game_state", match });

      if (match.status === "countdown") {
        io.to(matchId).emit("message", {
          type: "countdown_start",
          duration: 5,
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
        }, 5000);
      }
    } catch (error) {
      console.error(
        `[Event: player_set_ready] Error for ${socket.id} in match ${matchId}:`,
        error
      );
      socket.emit("message", {
        type: "error",
        error: error.message || "Could not set ready status.",
      });
    }
  });

  socket.on("make_move", async ({ matchId, column }) => {
    console.log(
      `[Event: make_move] Received from ${socket.id} for match ${matchId}, column ${column}`
    );
    try {
      const match = await roomManager.applyMove(matchId, socket.id, column);
      if (!match) {
        socket.emit("message", { type: "error", error: "Invalid move." });
        return;
      }

      const message = {
        type: "board_update",
        board: match.board,
        nextTurn: match.turn,
      };

      if (match.winner) {
        message.type = "game_over";
        message.winner = match.winner;
        message.winnerUsername = match.players.find(
          (p) => p.socketId === match.winner
        )?.username;
        if (match.winner === "draw") message.winnerUsername = "draw";

        io.to(matchId).emit("message", message);
        roomManager.stopTurnTimer(matchId);
      } else {
        io.to(matchId).emit("message", message);
        roomManager.startTurnTimer(io, matchId);
      }
    } catch (error) {
      console.error(`[Event: make_move] Error for match ${matchId}:`, error);
      socket.emit("message", { type: "error", error: error.message });
    }
  });

  socket.on("resign", ({ matchId }) => {
    console.log(
      `[Event: resign] Received from ${socket.id} for match ${matchId}`
    );
    roomManager.handleResignation(io, matchId, socket.id);
  });

  socket.on("disconnect", () => {
    console.log(`[Socket Disconnected] ID: ${socket.id}`);
    roomManager.handleDisconnect(io, socket.id);
  });
}

module.exports = registerSocketHandlers;
