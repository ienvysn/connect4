document.addEventListener("DOMContentLoaded", () => {
  const tabs = document.querySelectorAll(".tab-link");
  const tabContents = document.querySelectorAll(".tab-content");
  const usernameInput = document.getElementById("username");
  const createBtn = document.getElementById("create-btn");
  const matchIdInput = document.getElementById("matchId");
  const joinBtn = document.getElementById("join-btn");
  const errorMessage = document.getElementById("error-message");
  const socket = io();

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((item) => item.classList.remove("active"));
      tabContents.forEach((content) => content.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(tab.dataset.tab).classList.add("active");
    });
  });

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

  socket.on("message", (msg) => {
    if (msg.type === "match_created") {
      window.location.href = `/game.html?matchId=${msg.matchId}`;
      copyToClipboard(msg.matchId);
    }

    if (
      msg.type === "join_success" ||
      (msg.type === "game_state" && msg.match)
    ) {
      window.location.href = `/game.html?matchId=${msg.match.matchId}`;
    }

    if (msg.type === "error") {
      showError(msg.error);
    }
  });

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
      .then(() => {
        console.log("Match ID copied to clipboard");
      })
      .catch((err) => {
        console.error("Failed to copy text: ", err);
      });
  } else {
    // Fallback for older browsers
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand("copy");
      console.log("Match ID copied to clipboard (fallback)");
    } catch (err) {
      console.error("Fallback: Oops, unable to copy", err);
    }
    document.body.removeChild(textArea);
  }
}
