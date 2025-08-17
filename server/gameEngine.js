// Initialize empty 6x7 board
function initBoard() {
  return Array(6)
    .fill(null)
    .map(() => Array(7).fill(null));
}

// Apply a move (drop piece in column)
// Returns { board, row, col } if success, null if invalid
function applyMove(board, playerId, column) {
  if (column < 0 || column >= 7) return null;

  // Drop piece bottom-up
  for (let row = 5; row >= 0; row--) {
    if (board[row][column] === null) {
      board[row][column] = playerId;
      return { board, row, col: column };
    }
  }
  return null; // column full
}

// Check if a player wins after placing at (row, col)
function checkWin(board, row, col, playerId) {
  const directions = [
    [0, 1], // horizontal
    [1, 0], // vertical
    [1, 1], // diagonal down-right
    [1, -1], // diagonal up-right
  ];

  for (const [dr, dc] of directions) {
    let count = 1;

    // forward direction
    let r = row + dr,
      c = col + dc;
    while (r >= 0 && r < 6 && c >= 0 && c < 7 && board[r][c] === playerId) {
      count++;
      r += dr;
      c += dc;
    }

    // backward direction
    r = row - dr;
    c = col - dc;
    while (r >= 0 && r < 6 && c >= 0 && c < 7 && board[r][c] === playerId) {
      count++;
      r -= dr;
      c -= dc;
    }

    if (count >= 4) return true;
  }
  return false;
}

// Check if board is full
function isDraw(board) {
  return board.every((row) => row.every((cell) => cell !== null));
}

module.exports = { initBoard, applyMove, checkWin, isDraw };
