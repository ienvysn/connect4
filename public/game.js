const socket = io();
let currentMatchId = null;

socket.on("connect", () => {
  console.log("Connected:", socket.id);

  // auto create a match for testing
  socket.emit("create_match");
});

socket.on("message", (msg) => {
  console.log("Server says:", msg);

  if (msg.type === "match_created") {
    currentMatchId = msg.matchId;
    console.log("Match created:", currentMatchId);
  }

  if (msg.type === "joined_match") {
    console.log("Players in match:", msg.players);
  }

  if (msg.type === "board_update") {
    console.table(msg.board);
    console.log("Next turn:", msg.nextTurn);
  }
});

// for manual testing in console:
// join: socket.emit("join_match", { matchId: "abc123" })
// move: socket.emit("make_move", { matchId: currentMatchId, column: 3 })
