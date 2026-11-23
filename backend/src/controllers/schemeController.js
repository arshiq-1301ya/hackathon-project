const mongoose = require("mongoose");
const Scheme = require("../models/Scheme");
const Profile = require("../models/Profile");
const { validateProfileUpdate, CANONICAL_FIELDS } = require("../services/profileValidation");
const { matchSchemes: matchAgainstProfile } = require("../services/schemeMatchService");

const getAuthUserId = (req) => req.userId || (req.user && req.user.id) || null;

exports.listSchemes = async (req, res) => {
    try {
        const schemes = await Scheme.find({ isActive: true })
            .select("-__v")
            .sort({ name: 1 });

        return res.status(200).json({
            success: true,
            message: "Schemes fetched successfully",
            data: {
                schemes,
                count: schemes.length
            }
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to fetch schemes"
        });
    }
};

exports.getScheme = async (req, res) => {
    try {
        const id = req.params.id;

        const query = mongoose.isValidObjectId(id)
            ? { isActive: true, $or: [{ _id: id }, { slug: id }] }
            : { isActive: true, slug: id };

        const scheme = await Scheme.findOne(query).select("-__v");

        if (!scheme) {
            return res.status(404).json({
                success: false,
                message: "Scheme not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Scheme fetched successfully",
            data: {
                scheme
            }
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to fetch scheme"
        });
    }
};

exports.matchSchemes = async (req, res) => {
    try {
        const userId = getAuthUserId(req);
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const rawBody = req.body === undefined || req.body === null ? {} : req.body;
        if (typeof rawBody !== "object" || Array.isArray(rawBody)) {
            return res.status(400).json({ success: false, message: "Request body must be a JSON object" });
        }

        // Only the six canonical profile fields may override the saved profile; other keys are dropped.
        const overrides = {};
        for (const key of CANONICAL_FIELDS) {
            if (Object.prototype.hasOwnProperty.call(rawBody, key)) {
                overrides[key] = rawBody[key];
            }
        }

        const result = validateProfileUpdate(overrides);
        if (!result.ok) {
            return res.status(400).json({ success: false, message: result.message });
        }

        const saved = await Profile.findOne({ userId }).lean();
        const profile = {};
        if (saved) {
            for (const key of CANONICAL_FIELDS) {
                profile[key] = saved[key];
            }
        }
        Object.assign(profile, result.updates);

        const schemes = await Scheme.find({ isActive: true })
            .sort({ name: 1 })
            .lean();

        const results = matchAgainstProfile(schemes, profile);

        return res.status(200).json({
            success: true,
            message: "Scheme matching completed",
            data: {
                results,
                count: results.length
            }
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to match schemes"
        });
    }
};

