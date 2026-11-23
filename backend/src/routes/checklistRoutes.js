
const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
    getSchemeChecklist,
    createChecklist,
    updateChecklist
} = require("../controllers/checklistController");

router.get("/:id", authMiddleware, getSchemeChecklist);
router.post("/", authMiddleware, createChecklist);
router.patch("/:id", authMiddleware, updateChecklist);

module.exports = router;
