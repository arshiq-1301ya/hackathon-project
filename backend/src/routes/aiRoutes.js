const express = require("express");
const { GoogleGenAI } = require("@google/genai");

const Scheme = require("../models/Scheme");
const Profile = require("../models/Profile");
const authMiddleware = require("../middleware/authMiddleware");
const { containsSensitiveId, SENSITIVE_ID_MESSAGE } = require("../services/sensitiveInput");
const {
    normalizeProfile,
    buildRuleEngineResult,
    buildGeminiPrompt
} = require("../services/aiDecisionService");

const router = express.Router();

const apiKey = process.env.GEMINI_API_KEY;

const ai = apiKey
    ? new GoogleGenAI({
        apiKey
    })
    : null;

// Simple in-memory rate limit per user (protects the Gemini quota): 15 requests / minute.
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 15;
const hits = new Map();

const rateLimit = (req, res, next) => {
    const key = req.userId || req.ip;
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
    if (recent.length >= MAX_REQUESTS) {
        return res.status(429).json({
            success: false,
            message: "Too many questions. Please wait a minute and try again."
        });
    }
    recent.push(now);
    hits.set(key, recent);
    return next();
};

const MAX_MESSAGE_LENGTH = 1000;

router.post("/ask", authMiddleware, rateLimit, async (req, res) => {
    try {
        const body = req.body || {};
        const message = body.message;

        if (
            typeof message !== "string" ||
            message.trim().length < 3
        ) {
            return res.status(400).json({
                success: false,
                message: "Message must contain at least 3 characters"
            });
        }

        if (message.length > MAX_MESSAGE_LENGTH) {
            return res.status(400).json({
                success: false,
                message: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer`
            });
        }

        if (containsSensitiveId(message)) {
            return res.status(400).json({ success: false, message: SENSITIVE_ID_MESSAGE });
        }

        if (!ai) {
            return res.status(503).json({
                success: false,
                message: "AI service is not configured"
            });
        }

        const schemes = await Scheme.find({
            isActive: true
        })
            .select(
                "name slug description category benefits eligibility requiredDocuments applicationSteps deadline officialSource lastVerified verificationStatus"
            )
            .lean();

        // Prefer the saved profile of the logged-in user; fields sent in the request override it.
        const saved = await Profile.findOne({ userId: req.userId }).lean();
        const incomingProfile = {
            ...(saved || {}),
            ...(body.profile && typeof body.profile === "object" && !Array.isArray(body.profile)
                ? body.profile
                : {})
        };

        const profile = normalizeProfile(incomingProfile);

        const ruleEngine = buildRuleEngineResult(
            schemes,
            profile
        );

        const prompt = buildGeminiPrompt(
            message.trim(),
            ruleEngine
        );

        const response = await ai.models.generateContent({
            model: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
            contents: prompt
        });

        const reply = response.text || "";

        return res.status(200).json({
            success: true,
            message: "AI scheme analysis completed",
            data: {
                reply,
                profile,
                ruleEngine: {
                    totalSchemesEvaluated:
                        ruleEngine.totalSchemesEvaluated,

                    likelyEligibleCount:
                        ruleEngine.likelyEligible.length,

                    possibleMatchCount:
                        ruleEngine.possibleMatches.length,

                    results:
                        ruleEngine.allResults
                }
            }
        });

    } catch (error) {
        console.error("AI route error:", error.message);

        return res.status(502).json({
            success: false,
            message: "AI service is temporarily unavailable"
        });
    }
});

module.exports = router;