document.addEventListener("DOMContentLoaded", () => {
  // --- Existing Elements ---
  const tabs = document.querySelectorAll(".tab-link");
  const tabContents = document.querySelectorAll(".tab-content");
  const usernameInput = document.getElementById("username");
  const createBtn = document.getElementById("create-btn");
  const matchIdInput = document.getElementById("matchId");
  const joinBtn = document.getElementById("join-btn");
  const errorMessage = document.getElementById("error-message");

  const playAiBtn = document.getElementById("play-ai-btn");
  const difficultySelector = document.getElementById("difficulty");

  // Determine backend URL (Railway for production, localhost for development)
  // This can be set in a config or derived
  const BACKEND_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : "https://connect4-production.up.railway.app"; // Placeholder, user will need to update this

  const socket = io(BACKEND_URL);

  // --- Load Username from Local Storage ---
  const savedUsername = localStorage.getItem("c4_username");
  if (savedUsername) {
    usernameInput.value = savedUsername;
  }

  // --- Tab Switching Logic ---
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((item) => item.classList.remove("active"));
      tabContents.forEach((content) => content.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(tab.dataset.tab).classList.add("active");
    });
  });

  // --- Event Listeners ---
  createBtn.addEventListener("click", () => {
    const username = usernameInput.value.trim();
    if (!validateUsername(username)) return;

    localStorage.setItem("c4_username", username);
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

    localStorage.setItem("c4_username", username);
    socket.emit("join_match", { username, matchId });
  });

  // --- New AI Button Listener ---
  playAiBtn.addEventListener("click", () => {
    const username = usernameInput.value.trim();
    if (!validateUsername(username)) return;

    localStorage.setItem("c4_username", username);
    const difficulty = difficultySelector.value;

    socket.emit("create_ai_match", { username, difficulty });
  });

  // --- Socket Message Handling ---
  socket.on("message", (msg) => {
    if (msg.type === "match_created") {
      copyToClipboard(msg.matchId);
      window.location.href = `/game.html?matchId=${msg.matchId}`;
    }

    if (
      msg.type === "join_success" ||
      (msg.type === "game_state" && msg.match)
    ) {
      //  console.log(
      //       `Successfully joined match ${msg.match.matchId}. Redirecting...`
      //     );
      window.location.href = `/game.html?matchId=${msg.match.matchId}`;
    }

    if (msg.type === "error") {
      console.error(`Received error from server: ${msg.error}`);
      showError(msg.error);
    }
  });

  // --- Helper Functions ---
  function validateUsername(username) {
    if (!username) {
      showError("Please enter a username.");
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
    setTimeout(() => {
      errorMessage.textContent = "";
    }, 3000);
  }
});

function copyToClipboard(text) {
  if (navigator.clipboard) {
    navigator.clipboard
      .writeText(text)
      .then(() => {})
      .catch((err) => {
        console.error("Failed to copy text: ", err);
      });
  } else {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand("copy");
    } catch (err) {
      console.error("Fallback: Oops, unable to copy", err);
    }
    document.body.removeChild(textArea);
  }
}
