const express = require("express");
const { GoogleGenAI } = require("@google/genai");

const Scheme = require("../models/Scheme");
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

router.post("/ask", async (req, res) => {
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

        const incomingProfile =
            body.profile && typeof body.profile === "object"
                ? body.profile
                : {};

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
            model: "gemini-3.5-flash-lite",
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
