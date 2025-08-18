const roomManager = require("./roomManager");
const Match = require("./models/Match"); // Import the Match model

function registerSocketHandlers(io, socket) {
  socket.on("create_match", async ({ username }) => {
    try {
      const match = await roomManager.createMatch(socket.id, username);
      socket.join(match.matchId);
      socket.emit("message", { type: "match_created", matchId: match.matchId });
    } catch (error) {
      socket.emit("message", {
        type: "error",
        error: "Could not create match.",
      });
    }
  });

  socket.on("join_match", async ({ matchId, username }) => {
    try {
      const match = await roomManager.joinMatch(matchId, socket.id, username);
      socket.join(matchId);

      // **FIX:** Send a specific update to the room for the existing player
      io.to(matchId).emit("message", { type: "player_joined", match });

      // Send a success message only to the player who just joined to redirect them
      socket.emit("message", { type: "join_success", match });
    } catch (error) {
      socket.emit("message", { type: "error", error: error.message });
    }
  });

  socket.on("player_ready", async ({ matchId }) => {
    try {
      const match = await Match.findOne({ matchId });
      if (match) {
        socket.join(matchId);
        socket.emit("message", { type: "game_state", match });
      }
    } catch (error) {
      socket.emit("message", {
        type: "error",
        error: "Could not retrieve match data.",
      });
    }
  });

  socket.on("player_set_ready", async ({ matchId }) => {
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
          if (finalMatch.status !== "countdown") return;
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
      socket.emit("message", {
        type: "error",
        error: "Could not set ready status.",
      });
    }
  });

  socket.on("make_move", async ({ matchId, column }) => {
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
      socket.emit("message", { type: "error", error: message.error });
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
}

module.exports = registerSocketHandlers;
