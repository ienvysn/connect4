const gameEngine = require("./gameEngine");
const matches = {};

function createMatch(ownerId) {
  const matchId = Math.random().toString(36).substr(2, 6);

  matches[matchId] = {
    players: [ownerId],
    board: gameEngine.initBoard(),
    turn: ownerId,
    winner: null,
  };

  return matchId;
}

function joinMatch(matchId, playerId) {
  if (!matches[matchId]) return false;
  if (matches[matchId].players.length >= 2) return false;

  matches[matchId].players.push(playerId);
  return true;
}

function getMatch(matchId) {
  return matches[matchId];
}

function applyMove(matchId, playerId, column) {
  const match = matches[matchId];
  if (!match) return null;

  if (match.turn !== playerId || match.winner) return null;

  const move = gameEngine.applyMove(match.board, playerId, column);
  if (!move) return null; // invalid move

  // check win
  if (gameEngine.checkWin(match.board, move.row, move.col, playerId)) {
    match.winner = playerId;
  } else if (gameEngine.isDraw(match.board)) {
    match.winner = "draw";
  } else {
    // switch turn
    match.turn = match.players.find((p) => p !== playerId);
  }

  return { board: match.board, nextTurn: match.turn, winner: match.winner };
}

module.exports = { createMatch, joinMatch, getMatch, applyMove };
