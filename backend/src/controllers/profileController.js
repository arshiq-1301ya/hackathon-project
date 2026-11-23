const { extractProfile } = require("../services/profileExtractionService");
const { validateProfileUpdate } = require("../services/profileValidation");
const { containsSensitiveId, SENSITIVE_ID_MESSAGE } = require("../services/sensitiveInput");
const Profile = require("../models/Profile");

const MAX_TEXT_LENGTH = 2000;

const canonicalEmpty = () => ({
    state: "",
    educationLevel: "",
    annualFamilyIncome: null,
    purpose: "",
    occupation: "",
    landStatus: null,
    otherInfo: ""
});

const canonical = (doc) => ({
    state: doc.state ?? "",
    educationLevel: doc.educationLevel ?? "",
    annualFamilyIncome: doc.annualFamilyIncome ?? null,
    purpose: doc.purpose ?? "",
    occupation: doc.occupation ?? "",
    landStatus: doc.landStatus ?? null,
    otherInfo: doc.otherInfo ?? ""
});

const getAuthUserId = (req) => req.userId || (req.user && req.user.id) || null;

const handleProfileError = (err, res, next) => {
    if (err && err.name === "ValidationError") {
        return res.status(400).json({
            success: false,
            message: "Invalid profile data"
        });
    }
    if (err && err.code === 11000) {
        return res.status(409).json({
            success: false,
            message: "Profile already exists"
        });
    }
    return next(err);
};

exports.extractProfileFromText = async (req, res) => {
    try {
        const text = req.body ? req.body.text : undefined;

        if (typeof text !== "string" || text.trim() === "") {
            return res.status(400).json({
                success: false,
                message: "Text is required"
            });
        }

        if (text.length > MAX_TEXT_LENGTH) {
            return res.status(400).json({
                success: false,
                message: `Profile description must be ${MAX_TEXT_LENGTH} characters or fewer`
            });
        }

        if (containsSensitiveId(text)) {
            return res.status(400).json({ success: false, message: SENSITIVE_ID_MESSAGE });
        }

        const { profile, missingInformation, source } = await extractProfile(text.trim());

        res.status(200).json({
            success: true,
            message: "Profile extracted successfully",
            data: {
                profile,
                missingInformation,
                source
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Profile extraction failed"
        });
    }
};

exports.getProfile = async (req, res, next) => {
    try {
        const userId = getAuthUserId(req);
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const doc = await Profile.findOne({ userId }).lean();

        if (!doc) {
            return res.status(200).json({
                success: true,
                message: "Profile not found yet",
                data: {
                    profile: canonicalEmpty(),
                    updatedAt: null,
                    exists: false
                }
            });
        }

        return res.status(200).json({
            success: true,
            message: "Profile loaded",
            data: {
                profile: canonical(doc),
                updatedAt: doc.updatedAt,
                exists: true
            }
        });
    } catch (err) {
        return handleProfileError(err, res, next);
    }
};

exports.updateProfile = async (req, res, next) => {
    try {
        const userId = getAuthUserId(req);
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const result = validateProfileUpdate(req.body);
        if (!result.ok) {
            return res.status(400).json({ success: false, message: result.message });
        }

        const doc = await Profile.findOneAndUpdate(
            { userId },
            { $set: result.updates, $setOnInsert: { userId } },
            {
                upsert: true,
                new: true,
                runValidators: true,
                setDefaultsOnInsert: true
            }
        );

        return res.status(200).json({
            success: true,
            message: "Profile saved",
            data: {
                profile: canonical(doc),
                updatedAt: doc.updatedAt,
                exists: true
            }
        });
    } catch (err) {
        return handleProfileError(err, res, next);
    }
};