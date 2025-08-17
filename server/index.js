const express = require("express");
const app = express();
const port = 3000;

//web-socket
const socketio = require("socket.io");
const http = require("http");
const server = http.createServer(app);
io = socketio(server);

io.on("connection", (socket) => {
  console.log("New connection");
});
//routes
const matchRoute = require("./routes/matches");

//main app
app.use(express.static("public"));
app.use("/match", matchRoute);
app.get("/", (req, res) => {
  res.send("Welcome to Connect 4!");
});

server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
