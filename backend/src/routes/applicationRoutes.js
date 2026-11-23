const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const {
    createApplication,
    listApplications,
    updateApplication,
    deleteApplication
} = require("../controllers/applicationController");

router.get("/", authMiddleware, listApplications);
router.post("/", authMiddleware, createApplication);
router.patch("/:id", authMiddleware, updateApplication);
router.delete("/:id", authMiddleware, deleteApplication);

module.exports = router;
