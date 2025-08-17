const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const registerSocketHandlers = require("./sockets");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, "..", "public")));

// Route for the lobby (root)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

// Route for the game page
app.get("/game.html", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "game.html"));
});

// hook up socket.io handlers
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
  registerSocketHandlers(io, socket); // delegate to sockets.js
});

server.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
