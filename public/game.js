document.addEventListener("DOMContentLoaded", () => {
  const socket = io();

  // --- State Management ---
  let currentMatch = null;
  let myPlayerId = null;
  let timerInterval = null;

  // --- DOM Elements ---
  const boardElement = document.querySelector(".board");
  const p1Name = document.getElementById("player1-name"),
    p2Name = document.getElementById("player2-name");
  const p1Turn = document.getElementById("p1-turn-indicator"),
    p2Turn = document.getElementById("p2-turn-indicator");
  const p1ReadyBtn = document.getElementById("p1-ready-btn"),
    p2ReadyBtn = document.getElementById("p2-ready-btn");
  const p1Indicator = document.querySelector("#player1-card .ready-indicator"),
    p2Indicator = document.querySelector("#player2-card .ready-indicator");
  const timerSpan = document.getElementById("timer-span");
  const gameOverOverlay = document.getElementById("game-status-overlay"),
    gameOverText = document.getElementById("game-status-text");
  const countdownOverlay = document.getElementById("countdown-overlay"),
    countdownText = document.getElementById("countdown-text");
  const newGameBtn = document.getElementById("new-game-btn");
  const matchIdDisplay = document.getElementById("match-id-display");

  // --- Initialization ---
  const urlParams = new URLSearchParams(window.location.search);
  const matchId = urlParams.get("matchId");
  if (!matchId) {
    gameOverText.textContent = "Invalid Match ID.";
    gameOverOverlay.style.display = "flex";
    return;
  }
  matchIdDisplay.textContent = `Match ID: ${matchId}`;

  // --- Socket Event Handlers ---
  socket.on("connect", () => {
    myPlayerId = socket.id;
    socket.emit("player_ready", { matchId });
  });

  socket.on("message", (msg) => {
    switch (msg.type) {
      case "game_state":
        currentMatch = msg.match;
        renderAll(currentMatch);
        break;
      case "board_update":
        currentMatch.board = msg.board;
        currentMatch.turn = msg.nextTurn;
        renderAll(currentMatch);
        break;
      case "game_over":
        currentMatch.board = msg.board;
        currentMatch.winner = msg.winner;
        renderAll(currentMatch);
        showGameOver(msg.winner, msg.winnerUsername);
        break;
      case "timer_start":
        startTurnTimer(msg.duration);
        break;
      case "countdown_start":
        startCountdown(msg.duration);
        break;
      case "turn_switch_timer":
        currentMatch.board = msg.board;
        currentMatch.turn = msg.nextTurn;
        renderAll(currentMatch);
        break;
      case "error":
        alert(`Error: ${msg.error}`);
        break;
    }
  });

  // --- Rendering ---
  function renderAll(match) {
    if (!match) return;
    renderBoard(match);
    renderPlayerInfo(match);
    renderReadyStates(match);
  }

  function renderBoard(match) {
    boardElement.innerHTML = "";
    const isMyTurn =
      match.turn === myPlayerId && match.status === "in-progress";
    match.board.forEach((row) =>
      row.forEach((cell, colIndex) => {
        const slot = document.createElement("div");
        slot.classList.add("slot");
        slot.dataset.column = colIndex;
        if (cell !== 0) {
          const piece = document.createElement("div");
          piece.classList.add("piece");
          const player = match.players.find((p) => p.playerNumber === cell);
          if (player) {
            piece.classList.add(player.playerNumber === 1 ? "p1" : "p2");
          }
          slot.appendChild(piece);
        }
        if (isMyTurn) slot.classList.add("my-turn-hover");
        boardElement.appendChild(slot);
      })
    );
  }

  function renderPlayerInfo(match) {
    const p1 = match.players.find((p) => p.playerNumber === 1);
    const p2 = match.players.find((p) => p.playerNumber === 2);
    p1Name.textContent = p1 ? p1.username : "Player 1";
    p2Name.textContent = p2 ? p2.username : "Waiting...";

    p1Turn.classList.remove("current-turn", "waiting");
    p2Turn.classList.remove("current-turn", "waiting");

    if (match.status === "in-progress" && match.turn) {
      const turnPlayer = match.players.find((p) => p.socketId === match.turn);
      if (turnPlayer) {
        (turnPlayer.playerNumber === 1 ? p1Turn : p2Turn).classList.add(
          "current-turn"
        );
        (turnPlayer.playerNumber === 1 ? p2Turn : p1Turn).classList.add(
          "waiting"
        );
      }
    } else {
      p1Turn.classList.add("waiting");
      p2Turn.classList.add("waiting");
    }
  }

  // **FIXED:** Rewritten to be more robust and clear
  function renderReadyStates(match) {
    const p1 = match.players.find((p) => p.playerNumber === 1);
    const p2 = match.players.find((p) => p.playerNumber === 2);

    // This is the main condition to check if the game is in the "ready up" phase
    const isReadyPhase =
      match.status === "waiting" && match.players.length === 2;

    // Handle Player 1's card
    if (p1) {
      p1Indicator.className =
        "ready-indicator " + (p1.isReady ? "ready" : "not-ready");
      p1ReadyBtn.style.display = isReadyPhase ? "block" : "none";
      p1ReadyBtn.textContent = p1.isReady ? "Ready!" : "Ready Up";
      p1ReadyBtn.disabled = p1.isReady || p1.socketId !== myPlayerId;
    }

    // Handle Player 2's card
    if (p2) {
      p2Indicator.className =
        "ready-indicator " + (p2.isReady ? "ready" : "not-ready");
      p2ReadyBtn.style.display = isReadyPhase ? "block" : "none";
      p2ReadyBtn.textContent = p2.isReady ? "Ready!" : "Ready Up";
      p2ReadyBtn.disabled = p2.isReady || p2.socketId !== myPlayerId;
    } else {
      // If there's no player 2, their indicator is 'not-ready' and button is hidden
      p2Indicator.className = "ready-indicator not-ready";
      p2ReadyBtn.style.display = "none";
    }
  }

  // --- Event Logic ---
  boardElement.addEventListener("click", (e) => {
    const slot = e.target.closest(".slot");
    if (
      slot &&
      currentMatch &&
      currentMatch.turn === myPlayerId &&
      !currentMatch.winner
    ) {
      socket.emit("make_move", {
        matchId,
        column: parseInt(slot.dataset.column),
      });
    }
  });

  p1ReadyBtn.addEventListener("click", () =>
    socket.emit("player_set_ready", { matchId })
  );
  p2ReadyBtn.addEventListener("click", () =>
    socket.emit("player_set_ready", { matchId })
  );
  newGameBtn.addEventListener("click", () => (window.location.href = "/"));

  // --- Timers & Overlays ---
  function startTurnTimer(duration) {
    clearInterval(timerInterval);
    let timeLeft = duration;
    timerSpan.textContent = `00:${String(timeLeft).padStart(2, "0")}`;
    timerInterval = setInterval(() => {
      timeLeft--;
      if (timeLeft >= 0)
        timerSpan.textContent = `00:${String(timeLeft).padStart(2, "0")}`;
      if (timeLeft < 0) clearInterval(timerInterval);
    }, 1000);
  }

  function startCountdown(duration) {
    countdownOverlay.style.display = "flex";
    let timeLeft = duration;
    countdownText.textContent = `Game starting in ${timeLeft}`;
    const countdownInterval = setInterval(() => {
      timeLeft--;
      countdownText.textContent = `Game starting in ${timeLeft}`;
      if (timeLeft <= 0) {
        clearInterval(countdownInterval);
        countdownOverlay.style.display = "none";
      }
    }, 1000);
  }

  function showGameOver(winnerId, winnerUsername) {
    clearInterval(timerInterval);
    gameOverText.textContent =
      winnerId === "draw"
        ? "It's a Draw!"
        : winnerId === myPlayerId
        ? "You Win!"
        : `${winnerUsername} Wins!`;
    gameOverOverlay.style.display = "flex";
  }
});
