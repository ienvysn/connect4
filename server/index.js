const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const registerSocketHandlers = require("./sockets");
const mongoose = require("mongoose");
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const MONGO_URI = "mongodb://localhost:27017/connect4";

mongoose
  .connect(MONGO_URI)
  .then(() => console.log("Successfully connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

app.use(express.static(path.join(__dirname, "..", "public")));

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
