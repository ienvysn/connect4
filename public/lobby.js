document.addEventListener("DOMContentLoaded", () => {
  // --- Element Selectors ---
  const tabs = document.querySelectorAll(".tab-link");
  const tabContents = document.querySelectorAll(".tab-content");
  const usernameInput = document.getElementById("username");
  const createBtn = document.getElementById("create-btn");
  const matchIdInput = document.getElementById("matchId");
  const joinBtn = document.getElementById("join-btn");
  const errorMessage = document.getElementById("error-message");

  const socket = io();

  // --- Tab Navigation Logic ---
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      // Remove active class from all tabs and content
      tabs.forEach((item) => item.classList.remove("active"));
      tabContents.forEach((content) => content.classList.remove("active"));

      // Add active class to the clicked tab and corresponding content
      tab.classList.add("active");
      document.getElementById(tab.dataset.tab).classList.add("active");
    });
  });

  // --- Event Listeners for Buttons ---
  createBtn.addEventListener("click", () => {
    const username = usernameInput.value.trim();
    if (!validateUsername(username)) return;

    socket.emit("create_match", { username });
  });

  joinBtn.addEventListener("click", () => {
    const username = usernameInput.value.trim();
    const matchId = matchIdInput.value.trim();

    if (!validateUsername(username)) return;

    if (!matchId) {
      showError("Please enter a valid Match ID.");
      return;
    }
    socket.emit("join_match", { username, matchId });
  });

  // --- Socket Event Handlers ---
  socket.on("message", (msg) => {
    console.log("Server message:", msg);

    if (msg.type === "match_created") {
      // Player 1 (creator) gets redirected
      window.location.href = `/game.html?matchId=${msg.matchId}`;
    }

    if (msg.type === "game_start") {
      // Player 2 (joiner) gets redirected
      window.location.href = `/game.html?matchId=${msg.match.matchId}`;
    }

    if (msg.type === "error") {
      showError(msg.error);
    }
  });

  // --- Helper Functions ---
  function validateUsername(username) {
    if (!username) {
      showError("Please enter a username to continue.");
      return false;
    }
    if (username.length < 3) {
      showError("Username must be at least 3 characters.");
      return false;
    }
    return true;
  }

  function showError(message) {
    errorMessage.textContent = message;
    // Clear the error message after 3 seconds
    setTimeout(() => {
      errorMessage.textContent = "";
    }, 3000);
  }
});
