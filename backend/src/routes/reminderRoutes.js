const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const { getReminders } = require("../controllers/reminderController");

router.get("/", authMiddleware, getReminders);

module.exports = router;
