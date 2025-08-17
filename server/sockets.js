const roomManager = require("./roomManager");

function registerSocketHandlers(io, socket) {
  socket.on("create_match", () => {
    const matchId = roomManager.createMatch(socket.id);
    socket.join(matchId);
    console.log(`Match ${matchId} created by ${socket.id}`);

    socket.emit("message", { type: "match_created", matchId });
  });

  socket.on("join_match", ({ matchId }) => {
    const ok = roomManager.joinMatch(matchId, socket.id);
    if (!ok) {
      socket.emit("message", { type: "error", error: "Cannot join match" });
      return;
    }

    socket.join(matchId);
    console.log(`Player ${socket.id} joined match ${matchId}`);

    // notify both players
    io.to(matchId).emit("message", {
      type: "joined_match",
      matchId,
      players: roomManager.getMatch(matchId).players,
    });
  });

  socket.on("make_move", ({ matchId, column }) => {
    const result = roomManager.applyMove(matchId, socket.id, column);

    if (!result) {
      socket.emit("message", { type: "error", error: "Invalid move" });
      return;
    }

    console.log(
      `Player ${socket.id} made move in match ${matchId}, col ${column}`
    );

    // broadcast board update to both players
    io.to(matchId).emit("message", {
      type: "board_update",
      board: result.board,
      nextTurn: result.nextTurn,
    });
  });
}

module.exports = registerSocketHandlers;
