const roomManager = require("./roomManager");
const Match = require("./models/Match"); // Import the Match model

function registerSocketHandlers(io, socket) {
  socket.on("create_match", async ({ username }) => {
    try {
      const match = await roomManager.createMatch(socket.id, username);
      socket.join(match.matchId);
      socket.emit("message", { type: "match_created", matchId: match.matchId });
    } catch (error) {
      console.error("Error creating match:", error);
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
      // Notify everyone in the room (both players) of the new state
      io.to(matchId).emit("message", { type: "game_state", match });
    } catch (error) {
      console.error(`Error joining match ${matchId}:`, error);
      socket.emit("message", { type: "error", error: error.message });
    }
  });

  socket.on("player_ready", async ({ matchId }) => {
    try {
      let match = await Match.findOne({ matchId });
      if (match) {
        socket.join(matchId);

        // and update their socket ID to the new one.
        const player = match.players.find(
          (p) =>
            (p.socketId !== socket.id && match.players.length < 2) ||
            !io.sockets.sockets.get(p.socketId)
        );

        if (player && player.socketId !== socket.id) {
          console.log(
            `Player ${player.username} reconnected. Updating socket ID from ${player.socketId} to ${socket.id}`
          );
          player.socketId = socket.id;
          await match.save();
          match = await Match.findOne({ matchId }); // Re-fetch the match to get the latest data
        }

        io.to(matchId).emit("message", { type: "game_state", match });
      } else {
        socket.emit("message", { type: "error", error: "Match not found." });
      }
    } catch (error) {
      console.error(`Error on player_ready for match ${matchId}:`, error);
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
          if (!finalMatch || finalMatch.status !== "countdown") return; // Prevent race conditions

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
      // More detailed server-side logging
      console.error(
        `Error setting player ready for ${socket.id} in match ${matchId}:`,
        error
      );
      socket.emit("message", {
        type: "error",
        error: error.message || "Could not set ready status.",
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
      console.error(`Error on make_move for match ${matchId}:`, error);
      socket.emit("message", { type: "error", error: error.message });
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
}

module.exports = registerSocketHandlers;
