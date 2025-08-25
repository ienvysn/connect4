document.addEventListener("DOMContentLoaded", () => {
  const socket = io();

  // --- State Management ---
  let currentMatch = null;
  let myPlayerId = null;
  let timerInterval = null;
  let isBoardRendered = false;

  // --- DOM Elements ---
  const boardElement = document.querySelector(".board");
  const p1Card = document.getElementById("player1-card");
  const p2Card = document.getElementById("player2-card");
  const p1Name = document.getElementById("player1-name"),
    p2Name = document.getElementById("player2-name");
  const p1Status = document.getElementById("player1-status"),
    p2Status = document.getElementById("player2-status");
  const p1ReadyBtn = document.getElementById("p1-ready-btn"),
    p2ReadyBtn = document.getElementById("p2-ready-btn");
  const timerSpan = document.getElementById("timer-span");
  const turnTimerBar = document.getElementById("turn-timer-bar");
  const gameOverOverlay = document.getElementById("game-status-overlay"),
    gameOverText = document.getElementById("game-status-text");
  const countdownOverlay = document.getElementById("countdown-overlay"),
    countdownText = document.getElementById("countdown-text");
  const newGameBtn = document.getElementById("new-game-btn");
  const matchIdDisplay = document.getElementById("match-id-display");
  const confettiCanvas = document.getElementById("confetti-canvas");
  const toastContainer = document.getElementById("toast-container");
  const resignBtn = document.getElementById("resign-btn");
  const resignModal = document.getElementById("resign-modal");
  const confirmResignBtn = document.getElementById("confirm-resign-btn");
  const cancelResignBtn = document.getElementById("cancel-resign-btn");

  // --- Initialization ---
  const urlParams = new URLSearchParams(window.location.search);
  const matchId = urlParams.get("matchId");
  if (!matchId) {
    console.error("No Match ID found in URL");
    gameOverText.textContent = "Invalid Match ID.";
    gameOverOverlay.style.display = "flex";
    return;
  }
  matchIdDisplay.textContent = `Match ID: ${matchId}`;
  console.log(`[Game Client] Initialized for Match ID: ${matchId}`);

  // --- Socket Event Handlers ---
  socket.on("connect", () => {
    myPlayerId = socket.id;
    console.log(
      `[Game Client] Connected to server with socket ID: ${myPlayerId}. Emitting player_ready.`
    );
    socket.emit("player_ready", { matchId });
  });

  socket.on("message", (msg) => {
    console.log("[Game Client] Received message from server:", msg);
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
      case "opponent_disconnected":
        showToast("Your opponent has disconnected.");
        break;
      case "opponent_reconnected":
        showToast("Your opponent has reconnected.");
        break;
      case "error":
        console.error(`[Game Client] Server error: ${msg.error}`);
        alert(`Error: ${msg.error}`);
        break;
    }
  });

  // --- Rendering ---
  function renderAll(match) {
    if (!match) {
      console.warn("[Game Client] renderAll called with no match data.");
      return;
    }
    console.log(
      "[Game Client] Rendering all components with match data:",
      match
    );
    renderBoard(match);
    renderPlayerInfo(match);
    renderReadyStates(match);
  }

  function renderBoard(match) {
    if (!isBoardRendered) {
      boardElement.innerHTML = "";
      for (let i = 0; i < 42; i++) {
        const slot = document.createElement("div");
        slot.classList.add("slot");
        slot.dataset.column = i % 7;
        boardElement.appendChild(slot);
      }
      isBoardRendered = true;
    }

    const isMyTurn =
      match.turn === myPlayerId && match.status === "in-progress";

    match.board.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        const slotIndex = rowIndex * 7 + colIndex;
        const slot = boardElement.children[slotIndex];
        const hasPiece = slot.hasChildNodes();
        if (cell !== null && !hasPiece) {
          const piece = document.createElement("div");
          piece.classList.add("piece");
          const player = match.players.find((p) => p.playerNumber === cell);
          if (player) {
            piece.classList.add(player.playerNumber === 1 ? "p1" : "p2");
          }
          slot.appendChild(piece);
        }
        if (isMyTurn) {
          slot.classList.add("my-turn-hover");
        } else {
          slot.classList.remove("my-turn-hover");
        }
      });
    });
  }

  function renderPlayerInfo(match) {
    const p1 = match.players.find((p) => p.playerNumber === 1);
    const p2 = match.players.find((p) => p.playerNumber === 2);
    p1Name.textContent = p1 ? p1.username : "Player 1";
    p2Name.textContent = p2 ? p2.username : "Waiting...";

    const createBubblingText = (text) => {
      return text
        .split("")
        .map(
          (char, i) =>
            `<span style="--i:${i}">${char === " " ? "&nbsp;" : char}</span>`
        )
        .join("");
    };

    if (match.status === "in-progress" && match.turn) {
      const turnPlayer = match.players.find((p) => p.socketId === match.turn);
      if (turnPlayer) {
        if (turnPlayer.playerNumber === 1) {
          p1Status.textContent = "Your Turn";
          p1Status.className = "player-status turn-active";
          p2Status.innerHTML = createBubblingText("Waiting...");
          p2Status.className = "player-status turn-waiting";
        } else {
          p2Status.textContent = "Your Turn";
          p2Status.className = "player-status turn-active";
          p1Status.innerHTML = createBubblingText("Waiting...");
          p1Status.className = "player-status turn-waiting";
        }
      }
    } else if (match.status === "finished") {
      p1Status.textContent = "Game Over";
      p2Status.textContent = "Game Over";
      p1Status.className = "player-status";
      p2Status.className = "player-status";
    } else {
      p1Status.textContent = "";
      p2Status.textContent = "";
    }
  }

  function renderReadyStates(match) {
    const isPreGameLobby = match.status === "waiting";

    const p1 = match.players.find((p) => p.playerNumber === 1);
    if (p1 && p1ReadyBtn) {
      p1ReadyBtn.style.display =
        isPreGameLobby && match.players.length === 2 ? "block" : "none";
      p1ReadyBtn.textContent = p1.isReady ? "Ready!" : "Ready Up";
      p1ReadyBtn.disabled = p1.socketId !== myPlayerId;
    }

    const p2 = match.players.find((p) => p.playerNumber === 2);
    if (p2 && p2ReadyBtn) {
      p2ReadyBtn.style.display =
        isPreGameLobby && match.players.length === 2 ? "block" : "none";
      p2ReadyBtn.textContent = p2.isReady ? "Ready!" : "Ready Up";
      p2ReadyBtn.disabled = p2.socketId !== myPlayerId;
    } else if (p2ReadyBtn) {
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
      const column = parseInt(slot.dataset.column);
      console.log(
        `[Game Client] Clicked column ${column}. Emitting make_move.`
      );
      socket.emit("make_move", {
        matchId,
        column: column,
      });
    }
  });

  p1ReadyBtn.addEventListener("click", () => {
    console.log(
      "[Game Client] Clicked Player 1 Ready button. Emitting player_set_ready."
    );
    socket.emit("player_set_ready", { matchId });
  });
  p2ReadyBtn.addEventListener("click", () => {
    console.log(
      "[Game Client] Clicked Player 2 Ready button. Emitting player_set_ready."
    );
    socket.emit("player_set_ready", { matchId });
  });
  newGameBtn.addEventListener("click", () => (window.location.href = "/"));

  resignBtn.addEventListener("click", () => {
    console.log("[Game Client] Clicked Resign button. Opening modal.");
    resignModal.style.display = "flex";
  });
  cancelResignBtn.addEventListener("click", () => {
    console.log("[Game Client] Canceled resignation.");
    resignModal.style.display = "none";
  });
  confirmResignBtn.addEventListener("click", () => {
    console.log("[Game Client] Confirmed resignation. Emitting resign.");
    socket.emit("resign", { matchId });
    window.location.href = "/";
  });

  // --- Timers & Overlays ---
  function startTurnTimer(duration) {
    clearInterval(timerInterval);
    let timeLeft = duration;

    turnTimerBar.style.transition = "none";
    turnTimerBar.style.width = "100%";
    void turnTimerBar.offsetWidth;
    turnTimerBar.style.transition = `width ${duration}s linear`;
    turnTimerBar.style.width = "0%";

    timerSpan.textContent = `00:${String(timeLeft).padStart(2, "0")}`;
    timerInterval = setInterval(() => {
      timeLeft--;
      if (timeLeft >= 0) {
        timerSpan.textContent = `00:${String(timeLeft).padStart(2, "0")}`;
      } else {
        clearInterval(timerInterval);
      }
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
    turnTimerBar.style.width = "0%";
    const message =
      winnerId === "draw"
        ? "It's a Draw!"
        : winnerId === myPlayerId
        ? "You Win!"
        : `${winnerUsername} Wins!`;

    gameOverText.textContent = message;
    gameOverOverlay.style.display = "flex";

    if (winnerId !== "draw" && winnerId === myPlayerId) {
      const myConfetti = confetti.create(confettiCanvas, {
        resize: true,
        useWorker: true,
      });
      myConfetti({
        particleCount: 150,
        spread: 180,
        origin: { y: 0.6 },
      });
    }
  }

  function showToast(message) {
    console.log(`[Game Client] Showing toast: "${message}"`);
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add("show");
    }, 100);

    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => {
        toast.remove();
      }, 500);
    }, 5000);
  }
});
