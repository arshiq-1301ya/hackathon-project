const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normaliseEmail = (email) => String(email).trim().toLowerCase();
const signToken = (userId) =>
    jwt.sign({ userId: String(userId) }, process.env.JWT_SECRET, { expiresIn: "7d" });
exports.signup = async (req, res) => {
    try {
        const body = req.body || {};
        const { name, email, password } = body;

        if (name === undefined || name === null ||
            email === undefined || email === null ||
            password === undefined || password === null) {
            return res.status(400).json({
                success: false,
                message: "All fields are required"
            });
        }

        if (typeof name !== "string" || typeof email !== "string" || typeof password !== "string") {
            return res.status(400).json({
                success: false,
                message: "Name, email and password must be text"
            });
        }

        const trimmedName = name.trim();
        const normalisedEmail = normaliseEmail(email);

        if (trimmedName.length < 1 || trimmedName.length > 100) {
            return res.status(400).json({
                success: false,
                message: "Name must be between 1 and 100 characters"
            });
        }

        if (!EMAIL_REGEX.test(normalisedEmail)) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid email"
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 8 characters"
            });
        }

        const existingUser = await User.findOne({ email: normalisedEmail });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "Email already registered"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await User.create({
            name: trimmedName,
            email: normalisedEmail,
            password: hashedPassword
        });

        res.status(201).json({
            success: true,
            message: "User registered successfully",
            token: signToken(newUser._id),
            user: {
                _id: newUser._id,
                id: newUser._id,
                name: newUser.name,
                email: newUser.email
            }
        });

    } catch (error) {
        // Duplicate key (unique email index) raced past the findOne check
        if (error && error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "Email already registered"
            });
        }

        console.error("signup error:", error && error.name);
        res.status(500).json({
            success: false,
            message: "Something went wrong. Please try again."
        });
    }
};

exports.login = async (req, res) => {
    try {
        const body = req.body || {};
        const { email, password } = body;

        if (email === undefined || email === null || password === undefined || password === null) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required"
            });
        }

        if (typeof email !== "string" || typeof password !== "string") {
            return res.status(400).json({
                success: false,
                message: "Email and password must be text"
            });
        }

        if (email.trim() === "" || password === "") {
            return res.status(400).json({
                success: false,
                message: "Email and password are required"
            });
        }

        const normalisedEmail = normaliseEmail(email);

        const user = await User.findOne({ email: normalisedEmail }).select("+password");

        const isPasswordCorrect = user
            ? await bcrypt.compare(password, user.password)
            : false;

        if (!user || !isPasswordCorrect) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        const token = signToken(user._id);

        res.status(200).json({
            success: true,
            message: "Login successful",
            token,
            user: {
                _id: user._id,
                name: user.name,
                email: user.email
            }
        });

    } catch (error) {
        console.error("login error:", error && error.name);
        res.status(500).json({
            success: false,
            message: "Something went wrong. Please try again."
        });
    }
};

exports.getMe = async (req, res) => {
    try {
        const userId = req.userId;

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        const user = await User.findById(userId).select("-password");

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        res.status(200).json({
            success: true,
            user: {
                id: user._id,
                name: user.name,
                email: user.email
            }
        });

    } catch (error) {
        console.error("getMe error:", error && error.name);
        res.status(500).json({
            success: false,
            message: "Something went wrong. Please try again."
        });
    }
};
