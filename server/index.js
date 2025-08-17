const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const registerSocketHandlers = require("./sockets");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

// hook up socket.io handlers
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
  registerSocketHandlers(io, socket); // delegate to sockets.js
});

server.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
