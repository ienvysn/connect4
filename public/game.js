document.addEventListener("DOMContentLoaded", () => {
  const socket = io();

  // --- State Management ---
  let currentMatch = null;
  let myPlayerId = null;
  let timerInterval = null;

  // --- DOM Elements ---
  const boardElement = document.querySelector(".board");
  const player1NameElem = document.getElementById("player1-name");
  const player2NameElem = document.getElementById("player2-name");
  const p1TurnIndicator = document.getElementById("p1-turn-indicator");
  const p2TurnIndicator = document.getElementById("p2-turn-indicator");
  const timerSpan = document.getElementById("timer-span");
  const gameStatusOverlay = document.getElementById("game-status-overlay");
  const gameStatusText = document.getElementById("game-status-text");
  const newGameButton = document.getElementById("new-game-btn");
  const matchIdDisplay = document.getElementById("match-id-display");

  // --- Initialization ---
  const urlParams = new URLSearchParams(window.location.search);
  const matchId = urlParams.get("matchId");
  if (!matchId) {
    gameStatusText.textContent = "Invalid Match ID.";
    gameStatusOverlay.style.display = "flex";
    return; // Stop execution if no matchId
  }
  matchIdDisplay.textContent = `Match ID: ${matchId}`;

  // --- Socket Event Handlers ---
  socket.on("connect", () => {
    myPlayerId = socket.id;
    console.log("Connected to server with ID:", myPlayerId);

    // **FIX:** Tell the server we are ready to receive game data
    socket.emit("player_ready", { matchId });
  });

  socket.on("message", (msg) => {
    console.log("Server message:", msg);
    switch (msg.type) {
      case "game_state": // Changed from 'game_start' to a more general name
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
        startTimer(msg.duration);
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

  // --- Rendering Functions ---
  function renderAll(match) {
    if (!match) return;
    renderBoard(match.board, match.players, match.turn);
    renderPlayerInfo(match.players, match.turn);
  }

  function renderBoard(boardData, players, currentTurn) {
    boardElement.innerHTML = ""; // Clear the board
    const isMyTurn = currentTurn === myPlayerId;

    boardData.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        const slot = document.createElement("div");
        slot.classList.add("slot");
        slot.dataset.column = colIndex;

        if (cell !== 0) {
          const piece = document.createElement("div");
          piece.classList.add("piece");
          const player = players.find((p) => p.playerNumber === cell);
          if (player) {
            // Add check to ensure player exists
            piece.classList.add(player.playerNumber === 1 ? "p1" : "p2");
          }
          slot.appendChild(piece);
        }

        if (isMyTurn && currentMatch.status === "in-progress") {
          slot.classList.add("my-turn-hover");
        }

        boardElement.appendChild(slot);
      });
    });
  }

  function renderPlayerInfo(players, currentTurn) {
    const player1 = players.find((p) => p.playerNumber === 1);
    const player2 = players.find((p) => p.playerNumber === 2);

    if (player1) {
      player1NameElem.textContent = player1.username;
    } else {
      player1NameElem.textContent = "Player 1";
    }

    if (player2) {
      player2NameElem.textContent = player2.username;
    } else {
      player2NameElem.textContent = "Waiting...";
    }

    p1TurnIndicator.classList.remove("current-turn", "waiting");
    p2TurnIndicator.classList.remove("current-turn", "waiting");

    if (currentMatch.status === "in-progress" && currentTurn) {
      const turnPlayer = players.find((p) => p.socketId === currentTurn);
      if (turnPlayer) {
        if (turnPlayer.playerNumber === 1) {
          p1TurnIndicator.classList.add("current-turn");
          p2TurnIndicator.classList.add("waiting");
        } else {
          p1TurnIndicator.classList.add("waiting");
          p2TurnIndicator.classList.add("current-turn");
        }
      }
    } else {
      p1TurnIndicator.classList.add("waiting");
      p2TurnIndicator.classList.add("waiting");
    }
  }

  // --- Game Logic ---
  boardElement.addEventListener("click", (e) => {
    const slot = e.target.closest(".slot");
    if (slot) {
      if (!currentMatch || currentMatch.turn !== myPlayerId) {
        console.log("Not your turn!");
        return;
      }
      if (currentMatch.winner) {
        console.log("Game is over!");
        return;
      }
      const column = slot.dataset.column;
      socket.emit("make_move", { matchId, column: parseInt(column) });
    }
  });

  function startTimer(duration) {
    clearInterval(timerInterval);
    let timeLeft = duration;
    timerSpan.textContent = `00:${timeLeft.toString().padStart(2, "0")}`;

    timerInterval = setInterval(() => {
      timeLeft--;
      if (timeLeft >= 0) {
        timerSpan.textContent = `00:${timeLeft.toString().padStart(2, "0")}`;
      }
      if (timeLeft < 0) {
        clearInterval(timerInterval);
      }
    }, 1000);
  }

  function showGameOver(winnerId, winnerUsername) {
    clearInterval(timerInterval);
    let message = "";
    if (winnerId === "draw") {
      message = "It's a Draw!";
    } else if (winnerId === myPlayerId) {
      message = "You Win!";
    } else {
      message = `${winnerUsername} Wins!`;
    }
    gameStatusText.textContent = message;
    gameStatusOverlay.style.display = "flex";
  }

  newGameButton.addEventListener("click", () => {
    window.location.href = "/"; // Go back to the lobby
  });
});
