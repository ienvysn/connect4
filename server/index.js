require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const path = require("path");
const session = require("express-session");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const registerSocketHandlers = require("./sockets");
const matchRoutes = require("./routes/matches");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- Middleware Section ---
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
});

app.use(
  helmet.contentSecurityPolicy({
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "script-src": [
        "'self'",
        "https://cdn.socket.io",
        "https://cdn.jsdelivr.net",
      ],
      "worker-src": ["'self'", "blob:"],
      "connect-src": [
        "'self'",
        "ws://localhost:3000",
        "wss://localhost:3000",
        "https://*.vercel.app",
        "wss://*.vercel.app",
        process.env.BACKEND_URL ? process.env.BACKEND_URL.replace('http', 'ws') : "",
        process.env.BACKEND_URL ? process.env.BACKEND_URL : ""
      ].filter(Boolean),
    },
  })
);
const corsOptions = {
  origin: process.env.FRONTEND_URL || "*",
  methods: ["GET", "POST"],
  credentials: true
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(sessionMiddleware);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use(limiter);
const staticOptions = {
  maxAge: "7d",
};
app.use(express.static(path.join(__dirname, "../public"), staticOptions));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.get("/game", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "game.html"));
});

app.use("/api/matches", matchRoutes);

// --- Socket.IO Setup ---
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

io.on("connection", (socket) => {
  registerSocketHandlers(io, socket);
});


const PORT = process.env.PORT || 3000;
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("Successfully connected to MongoDB");
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Database connection error:", err);
  });
