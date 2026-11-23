const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const {
    extractProfileFromText,
    getProfile,
    updateProfile
} = require("../controllers/profileController");

router.get("/", authMiddleware, getProfile);
router.patch("/", authMiddleware, updateProfile);
router.post("/extract", authMiddleware, extractProfileFromText);

module.exports = router;
