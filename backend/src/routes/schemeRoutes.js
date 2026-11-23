const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const { listSchemes, getScheme, matchSchemes } = require("../controllers/schemeController");
const { getSchemeChecklist } = require("../controllers/checklistController");

router.get("/", listSchemes);
router.post("/match", authMiddleware, matchSchemes);
router.get("/:id", getScheme);
router.get("/:id/checklist", authMiddleware, getSchemeChecklist);

module.exports = router;
