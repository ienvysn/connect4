const gameEngine = require("./gameEngine");

const AI_PLAYER_NUM = 2;
const HUMAN_PLAYER_NUM = 1;
const WINDOW_LENGTH = 4;

function evaluateWindow(window, piece) {
  let score = 0;
  const opponentPiece =
    piece === HUMAN_PLAYER_NUM ? AI_PLAYER_NUM : HUMAN_PLAYER_NUM;

  const pieceCount = window.filter((p) => p === piece).length;
  const opponentCount = window.filter((p) => p === opponentPiece).length;
  const emptyCount = window.filter((p) => p === 0).length;

  if (pieceCount === 4) {
    score += 10000;
  } else if (pieceCount === 3 && emptyCount === 1) {
    score += 100;
  } else if (pieceCount === 2 && emptyCount === 2) {
    score += 10;
  }

  if (opponentCount === 3 && emptyCount === 1) {
    score -= 1000;
  }

  return score;
}

function scorePosition(board, piece) {
  let score = 0;
  const ROWS = board.length;
  const COLS = board[0].length;

  const centerCol = Math.floor(COLS / 2);
  const centerColumnArray = board.map((row) => row[centerCol]);
  const centerCount = centerColumnArray.filter((p) => p === piece).length;
  score += centerCount * 6;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c <= COLS - WINDOW_LENGTH; c++) {
      const window = board[r].slice(c, c + WINDOW_LENGTH);
      score += evaluateWindow(window, piece);
    }
  }

  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r <= ROWS - WINDOW_LENGTH; r++) {
      const window = [];
      for (let i = 0; i < WINDOW_LENGTH; i++) {
        window.push(board[r + i][c]);
      }
      score += evaluateWindow(window, piece);
    }
  }

  for (let r = 0; r <= ROWS - WINDOW_LENGTH; r++) {
    for (let c = 0; c <= COLS - WINDOW_LENGTH; c++) {
      const window = [];
      for (let i = 0; i < WINDOW_LENGTH; i++) {
        window.push(board[r + i][c + i]);
      }
      score += evaluateWindow(window, piece);
    }
  }

  for (let r = 0; r <= ROWS - WINDOW_LENGTH; r++) {
    for (let c = WINDOW_LENGTH - 1; c < COLS; c++) {
      const window = [];
      for (let i = 0; i < WINDOW_LENGTH; i++) {
        window.push(board[r + i][c - i]);
      }
      score += evaluateWindow(window, piece);
    }
  }

  return score;
}

function isTerminalNode(board) {
  return (
    gameEngine.checkWin(board, null, null, HUMAN_PLAYER_NUM) ||
    gameEngine.checkWin(board, null, null, AI_PLAYER_NUM) ||
    gameEngine.isDraw(board)
  );
}

function minimax(board, depth, alpha, beta, maximizingPlayer) {
  const validMoves = gameEngine.getValidMoves(board);
  const isTerminal = isTerminalNode(board);

  if (depth === 0 || isTerminal) {
    if (isTerminal) {
      if (gameEngine.checkWin(board, null, null, AI_PLAYER_NUM))
        return [null, 10000000];
      if (gameEngine.checkWin(board, null, null, HUMAN_PLAYER_NUM))
        return [null, -10000000];
      return [null, 0];
    } else {
      return [null, scorePosition(board, AI_PLAYER_NUM)];
    }
  }

  if (maximizingPlayer) {
    let value = -Infinity;
    let column = validMoves[Math.floor(Math.random() * validMoves.length)];
    for (const col of validMoves) {
      const boardCopy = JSON.parse(JSON.stringify(board));
      gameEngine.applyMove(boardCopy, AI_PLAYER_NUM, col);
      const newScore = minimax(boardCopy, depth - 1, alpha, beta, false)[1];
      if (newScore > value) {
        value = newScore;
        column = col;
      }
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return [column, value];
  } else {
    let value = Infinity;
    let column = validMoves[Math.floor(Math.random() * validMoves.length)];
    for (const col of validMoves) {
      const boardCopy = JSON.parse(JSON.stringify(board));
      gameEngine.applyMove(boardCopy, HUMAN_PLAYER_NUM, col);
      const newScore = minimax(boardCopy, depth - 1, alpha, beta, true)[1];
      if (newScore < value) {
        value = newScore;
        column = col;
      }
      beta = Math.min(beta, value);
      if (alpha >= beta) break;
    }
    return [column, value];
  }
}

function findBestMove(board, difficulty) {
  let depth = 4;
  if (difficulty === "easy") depth = 1;
  if (difficulty === "hard") depth = 5;



  if (difficulty === "easy" && Math.random() < 0.2) {
    const availableMoves = gameEngine.getValidMoves(board);
    const randomMove =
      availableMoves[Math.floor(Math.random() * availableMoves.length)];

    return randomMove;
  }

  const [bestMove, score] = minimax(board, depth, -Infinity, Infinity, true);

  return bestMove;
}

module.exports = { findBestMove };
