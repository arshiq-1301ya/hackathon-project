
require("dotenv").config();

// Fail fast if required environment variables are missing (names only, never values)
const REQUIRED_ENV = ["JWT_SECRET", "MONGODB_URI"];
for (const name of REQUIRED_ENV) {
    if (!process.env[name] || !String(process.env[name]).trim()) {
        console.error(`Missing required environment variable: ${name}`);
        process.exit(1);
    }
}

const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const profileRoutes = require("./routes/profileRoutes");
const schemeRoutes = require("./routes/schemeRoutes");
const checklistRoutes = require("./routes/checklistRoutes");
const applicationRoutes = require("./routes/applicationRoutes");
const reminderRoutes = require("./routes/reminderRoutes");
const aiRoutes = require("./routes/aiRoutes");

const app = express();

const PORT = process.env.PORT || 5000;

// CORS allow-list: FRONTEND_ORIGIN (comma-separated) or local defaults
const allowList = process.env.FRONTEND_ORIGIN
    ? process.env.FRONTEND_ORIGIN.split(",").map((o) => o.trim()).filter((o) => o.length > 0)
    : ["http://localhost:5500", "http://127.0.0.1:5500"];

app.use(
    cors({
        origin: (origin, callback) => {
            // Allow requests with no Origin header (e.g. curl, server-to-server)
            if (!origin) return callback(null, true);
            if (allowList.includes(origin)) return callback(null, true);
                        if (process.env.NODE_ENV !== "production") {
                if (origin === "null" || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
                    return callback(null, true);
                }
            }

            return callback(new Error("Not allowed by CORS"));
        },
        methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"]
    })
);
app.use(express.json({ limit: "16kb" }));

// Main route
app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "Backend server is running successfully!"
    });
});

// Health route
app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        message: "Backend server is running successfully!"
    });
});


// Auth routes
app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/schemes", schemeRoutes);
app.use("/api/checklists", checklistRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/reminders", reminderRoutes);
app.use("/api/ai", aiRoutes);

// 404 for unknown API routes
app.use("/api", (req, res) => {
    res.status(404).json({ success: false, message: "Route not found" });
});

// Final error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    if (err.type === "entity.parse.failed") {
        return res.status(400).json({ success: false, message: "Invalid JSON body" });
    }
    if (err.type === "entity.too.large") {
        return res.status(413).json({ success: false, message: "Request body too large" });
    }
    if (typeof err.message === "string" && err.message.startsWith("Not allowed by CORS")) {
        return res.status(403).json({ success: false, message: "Origin not allowed" });
    }
    console.error(err.name);
    return res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
});

const startServer = async () => {
    await connectDB();

    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
};

startServer().catch((err) => {
    console.error(err.name);
    process.exit(1);
});
