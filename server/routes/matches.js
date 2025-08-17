const express = require("express");
const { v4: uuidv4 } = require("uuid");

const router = express.Router();

router.get("/create", (req, res) => {
  const matchId = uuidv4();
  res.status(200).json({ matchId: matchId });
});

module.exports = router;
