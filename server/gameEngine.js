const ROWS = 6;
const COLS = 7;

function initBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function applyMove(board, player, col) {
  if (col < 0 || col >= COLS || board[0][col] !== 0) {
    return null;
  }
  for (let row = ROWS - 1; row >= 0; row--) {
    if (board[row][col] === 0) {
      board[row][col] = player;
      return { board, row, col };
    }
  }
  return null;
}

function isDraw(board) {
  return board[0].every((cell) => cell !== 0);
}

function checkWin(board, row, col, player) {
  function checkDirection(startRow, startCol, dr, dc) {
    let count = 0;
    for (let i = 0; i < 4; i++) {
      const r = startRow + i * dr;
      const c = startCol + i * dc;
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === player) {
        count++;
      }
    }
    return count === 4;
  }

  if (row !== null && col !== null) {
    // Check all possible winning lines that include the new piece
    for (let i = 0; i < 4; i++) {
      // Horizontal
      if (checkDirection(row, col - i, 0, 1)) return true;
      // Vertical
      if (checkDirection(row - i, col, 1, 0)) return true;
      // Diagonal /
      if (checkDirection(row + i, col - i, -1, 1)) return true;
      // Diagonal \
      if (checkDirection(row - i, col - i, 1, 1)) return true;
    }
  } else {
    // AI check: Iterate through all possible starting points
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (
          checkDirection(r, c, 0, 1) ||
          checkDirection(r, c, 1, 0) ||
          checkDirection(r, c, 1, 1) ||
          checkDirection(r, c, 1, -1)
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

function getValidMoves(board) {
  const validMoves = [];
  for (let c = 0; c < COLS; c++) {
    if (board[0][c] === 0) {
      validMoves.push(c);
    }
  }
  return validMoves;
}

module.exports = {
  initBoard,
  applyMove,
  isDraw,
  checkWin,
  getValidMoves,
};
