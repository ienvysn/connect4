const roomManager = require("./roomManager");
const Match = require("./models/Match"); // Import the Match model

function registerSocketHandlers(io, socket) {
  socket.on("create_match", async ({ username }) => {
    try {
      const match = await roomManager.createMatch(socket.id, username);
      socket.join(match.matchId);
      console.log(
        `Match ${match.matchId} created by ${username} (${socket.id})`
      );
      socket.emit("message", { type: "match_created", matchId: match.matchId });
    } catch (error) {
      console.error("Create match error:", error);
      socket.emit("message", {
        type: "error",
        error: "Could not create match. Please try again.",
      });
    }
  });

  socket.on("join_match", async ({ matchId, username }) => {
    try {
      const match = await roomManager.joinMatch(matchId, socket.id, username);
      socket.join(matchId);
      console.log(`Player ${username} (${socket.id}) joined match ${matchId}`);

      // Notify both players that the game is starting
      io.to(matchId).emit("message", {
        type: "game_state", // Use a consistent event name
        match,
      });

      roomManager.startTurnTimer(io, matchId);
    } catch (error) {
      console.error(`Join match error for ${matchId}:`, error);
      socket.emit("message", { type: "error", error: error.message });
    }
  });

  // **FIX:** New listener for when a client loads the game page
  socket.on("player_ready", async ({ matchId }) => {
    try {
      const match = await Match.findOne({ matchId });
      if (match) {
        // Add this socket to the room in case it's a reconnect/refresh
        socket.join(matchId);
        // Send the current game state to the player who just loaded
        socket.emit("message", {
          type: "game_state",
          match,
        });
        console.log(
          `Sent game state for match ${matchId} to player ${socket.id}`
        );
      }
    } catch (error) {
      console.error(`Player ready error for ${matchId}:`, error);
      socket.emit("message", {
        type: "error",
        error: "Could not retrieve match data.",
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
      console.error(`Make move error in ${matchId}:`, error);
      socket.emit("message", { type: "error", error: error.message });
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
}

module.exports = registerSocketHandlers;
