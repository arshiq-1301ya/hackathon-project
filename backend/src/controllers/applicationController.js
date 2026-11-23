const mongoose = require("mongoose");
const Scheme = require("../models/Scheme");
const Application = require("../models/Application");

const { APPLICATION_STATUSES } = Application;
const OBJECT_ID_REGEX = /^[a-fA-F0-9]{24}$/;
const MAX_NOTES_LENGTH = 2000;
const MAX_TRACKING_LENGTH = 100;
const SCHEME_POPULATE_FIELDS = "name slug category deadline officialSource";
const SUBMITTED_STATUSES = ["submitted", "approved"];

const getAuthUserId = (req) => req.userId || (req.user && req.user.id) || null;

const isValidId = (value) =>
    typeof value === "string" && OBJECT_ID_REGEX.test(value) && mongoose.Types.ObjectId.isValid(value);

// Returns { ok: true, value } where value is a Date or null, or { ok: false }
const parseDeadline = (value) => {
    if (value === null) return { ok: true, value: null };
    if (typeof value !== "string" && typeof value !== "number") return { ok: false };
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return { ok: false };
    return { ok: true, value: date };
};

const validateStatus = (value) => typeof value === "string" && APPLICATION_STATUSES.includes(value);

const validateText = (value, maxLength) => typeof value === "string" && value.length <= maxLength;

const handleApplicationError = (err, res, next) => {
    if (err && err.name === "ValidationError") {
        return res.status(400).json({ success: false, message: "Invalid application data" });
    }
    return next(err);
};

exports.createApplication = async (req, res, next) => {
    try {
        const userId = getAuthUserId(req);
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const body = req.body || {};
        const { schemeId, status, deadline, notes, trackingNumber } = body;

        if (!isValidId(schemeId)) {
            return res.status(400).json({ success: false, message: "Invalid scheme id" });
        }

        const fields = {};

        if (status !== undefined) {
            if (!validateStatus(status)) {
                return res.status(400).json({ success: false, message: "Invalid status" });
            }
            fields.status = status;
        }

        if (deadline !== undefined) {
            const parsed = parseDeadline(deadline);
            if (!parsed.ok) {
                return res.status(400).json({ success: false, message: "Invalid deadline" });
            }
            fields.deadline = parsed.value;
        }

        if (notes !== undefined) {
            if (!validateText(notes, MAX_NOTES_LENGTH)) {
                return res.status(400).json({
                    success: false,
                    message: `Notes must be a string of ${MAX_NOTES_LENGTH} characters or fewer`
                });
            }
            fields.notes = notes;
        }

        if (trackingNumber !== undefined) {
            if (!validateText(trackingNumber, MAX_TRACKING_LENGTH)) {
                return res.status(400).json({
                    success: false,
                    message: `Tracking number must be a string of ${MAX_TRACKING_LENGTH} characters or fewer`
                });
            }
            fields.trackingNumber = trackingNumber;
        }

        const scheme = await Scheme.findOne({ _id: schemeId, isActive: true }).select("_id").lean();
        if (!scheme) {
            return res.status(404).json({ success: false, message: "Scheme not found" });
        }

        const existing = await Application.findOne({ userId, schemeId }).select("_id").lean();
        if (existing) {
            return res.status(409).json({
                success: false,
                message: "Application already exists for this scheme"
            });
        }

        let created;
        try {
            created = await Application.create({ ...fields, userId, schemeId });
        } catch (err) {
            if (err && err.code === 11000) {
                return res.status(409).json({
                    success: false,
                    message: "Application already exists for this scheme"
                });
            }
            throw err;
        }

        const application = await Application.findById(created._id).populate("schemeId", SCHEME_POPULATE_FIELDS);

        return res.status(201).json({
            success: true,
            message: "Application created",
            data: { application }
        });
    } catch (err) {
        return handleApplicationError(err, res, next);
    }
};

exports.listApplications = async (req, res, next) => {
    try {
        const userId = getAuthUserId(req);
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const applications = await Application.find({ userId })
            .sort({ updatedAt: -1 })
            .populate("schemeId", SCHEME_POPULATE_FIELDS)
            .lean();

        return res.status(200).json({
            success: true,
            message: "Applications fetched",
            data: {
                applications,
                count: applications.length
            }
        });
    } catch (err) {
        return handleApplicationError(err, res, next);
    }
};

exports.updateApplication = async (req, res, next) => {
    try {
        const userId = getAuthUserId(req);
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const applicationId = req.params.id;
        if (!isValidId(applicationId)) {
            return res.status(400).json({ success: false, message: "Invalid application id" });
        }

        const body = req.body || {};
        const { status, deadline, notes, trackingNumber } = body;

        if (status !== undefined && !validateStatus(status)) {
            return res.status(400).json({ success: false, message: "Invalid status" });
        }

        let parsedDeadline;
        if (deadline !== undefined) {
            parsedDeadline = parseDeadline(deadline);
            if (!parsedDeadline.ok) {
                return res.status(400).json({ success: false, message: "Invalid deadline" });
            }
        }

        if (notes !== undefined && !validateText(notes, MAX_NOTES_LENGTH)) {
            return res.status(400).json({
                success: false,
                message: `Notes must be a string of ${MAX_NOTES_LENGTH} characters or fewer`
            });
        }

        if (trackingNumber !== undefined && !validateText(trackingNumber, MAX_TRACKING_LENGTH)) {
            return res.status(400).json({
                success: false,
                message: `Tracking number must be a string of ${MAX_TRACKING_LENGTH} characters or fewer`
            });
        }

        const application = await Application.findOne({ _id: applicationId, userId });
        if (!application) {
            return res.status(404).json({ success: false, message: "Application not found" });
        }

        if (status !== undefined) application.status = status;
        if (parsedDeadline !== undefined) application.deadline = parsedDeadline.value;
        if (notes !== undefined) application.notes = notes;
        if (trackingNumber !== undefined) application.trackingNumber = trackingNumber;

        if (SUBMITTED_STATUSES.includes(application.status) && !application.submittedAt) {
            application.submittedAt = new Date();
        }

        await application.save();

        const populated = await Application.findById(application._id).populate("schemeId", SCHEME_POPULATE_FIELDS);

        return res.status(200).json({
            success: true,
            message: "Application updated",
            data: { application: populated }
        });
    } catch (err) {
        return handleApplicationError(err, res, next);
    }
};

exports.deleteApplication = async (req, res, next) => {
    try {
        const userId = getAuthUserId(req);
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const applicationId = req.params.id;
        if (!isValidId(applicationId)) {
            return res.status(400).json({ success: false, message: "Invalid application id" });
        }

        const deleted = await Application.findOneAndDelete({ _id: applicationId, userId }).lean();
        if (!deleted) {
            return res.status(404).json({ success: false, message: "Application not found" });
        }

        return res.status(200).json({ success: true, message: "Application deleted" });
    } catch (err) {
        return handleApplicationError(err, res, next);
    }
};
