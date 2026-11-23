const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");

const OBJECT_ID_REGEX = /^[a-fA-F0-9]{24}$/;

const authMiddleware = async (req, res, next) => {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
        return res.status(401).json({
            success: false,
            message: "Authentication required"
        });
    }

    const token = header.slice("Bearer ".length).trim();

    if (!token) {
        return res.status(401).json({
            success: false,
            message: "Authentication required"
        });
    }

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: "Invalid or expired token"
        });
    }

    const userId = decoded && decoded.userId;

    if (
        typeof userId !== "string" ||
        !mongoose.Types.ObjectId.isValid(userId) ||
        !OBJECT_ID_REGEX.test(userId)
    ) {
        return res.status(401).json({
            success: false,
            message: "Invalid or expired token"
        });
    }

    try {
        const exists = await User.exists({ _id: userId });

        if (!exists) {
            return res.status(401).json({
                success: false,
                message: "Invalid or expired token"
            });
        }
    } catch (error) {
        return next(error);
    }

    req.userId = userId;
    req.user = { id: userId };
    return next();
};

module.exports = authMiddleware;
