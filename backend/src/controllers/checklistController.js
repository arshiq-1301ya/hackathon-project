const mongoose = require("mongoose");
const Scheme = require("../models/Scheme");
const Checklist = require("../models/Checklist");

const OBJECT_ID_REGEX = /^[a-fA-F0-9]{24}$/;

const getAuthUserId = (req) => req.userId || (req.user && req.user.id) || null;

const isValidId = (value) =>
    typeof value === "string" && OBJECT_ID_REGEX.test(value) && mongoose.Types.ObjectId.isValid(value);

const buildTemplateItems = (requiredDocuments) =>
    (Array.isArray(requiredDocuments) ? requiredDocuments : []).map((label, index) => ({
        key: `doc-${index}`,
        label,
        completed: false,
        completedAt: null
    }));

const toChecklistView = (checklist) => ({
    _id: checklist._id,
    schemeId: checklist.schemeId,
    persisted: true,
    items: checklist.items.map((item) => ({
        key: item.key,
        label: item.label,
        completed: item.completed,
        completedAt: item.completedAt
    }))
});

const toTemplateView = (scheme) => ({
    _id: null,
    schemeId: scheme._id,
    persisted: false,
    items: buildTemplateItems(scheme.requiredDocuments)
});

const toSchemeView = (scheme) => ({ _id: scheme._id, name: scheme.name });

const handleChecklistError = (err, res, next) => {
    if (err && err.name === "ValidationError") {
        return res.status(400).json({ success: false, message: "Invalid checklist data" });
    }
    return next(err);
};

exports.getSchemeChecklist = async (req, res, next) => {
    try {
        const userId = getAuthUserId(req);
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const schemeId = req.params.id;
        if (!isValidId(schemeId)) {
            return res.status(400).json({ success: false, message: "Invalid scheme id" });
        }

        const scheme = await Scheme.findOne({ _id: schemeId, isActive: true }).lean();
        if (!scheme) {
            return res.status(404).json({ success: false, message: "Scheme not found" });
        }

        const doc = await Checklist.findOne({ userId, schemeId }).lean();
        const checklist = doc ? toChecklistView(doc) : toTemplateView(scheme);

        return res.status(200).json({
            success: true,
            message: "Checklist fetched",
            data: {
                scheme: toSchemeView(scheme),
                checklist
            }
        });
    } catch (err) {
        return handleChecklistError(err, res, next);
    }
};

exports.createChecklist = async (req, res, next) => {
    try {
        const userId = getAuthUserId(req);
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const schemeId = (req.body || {}).schemeId;
        if (!isValidId(schemeId)) {
            return res.status(400).json({ success: false, message: "Invalid scheme id" });
        }

        const scheme = await Scheme.findOne({ _id: schemeId, isActive: true }).lean();
        if (!scheme) {
            return res.status(404).json({ success: false, message: "Scheme not found" });
        }

        const existing = await Checklist.findOne({ userId, schemeId }).lean();
        if (existing) {
            return res.status(200).json({
                success: true,
                message: "Checklist fetched",
                data: {
                    scheme: toSchemeView(scheme),
                    checklist: toChecklistView(existing)
                }
            });
        }

        let created;
        try {
            created = await Checklist.create({
                userId,
                schemeId,
                items: buildTemplateItems(scheme.requiredDocuments)
            });
        } catch (err) {
            // Concurrent create for the same user/scheme: return the existing checklist (idempotent)
            if (err && err.code === 11000) {
                const raced = await Checklist.findOne({ userId, schemeId }).lean();
                if (raced) {
                    return res.status(200).json({
                        success: true,
                        message: "Checklist fetched",
                        data: {
                            scheme: toSchemeView(scheme),
                            checklist: toChecklistView(raced)
                        }
                    });
                }
            }
            throw err;
        }

        return res.status(201).json({
            success: true,
            message: "Checklist created",
            data: {
                scheme: toSchemeView(scheme),
                checklist: toChecklistView(created.toObject())
            }
        });
    } catch (err) {
        return handleChecklistError(err, res, next);
    }
};

exports.updateChecklist = async (req, res, next) => {
    try {
        const userId = getAuthUserId(req);
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const checklistId = req.params.id;
        if (!isValidId(checklistId)) {
            return res.status(400).json({ success: false, message: "Invalid checklist id" });
        }

        const updates = (req.body || {}).items;
        const validShape =
            Array.isArray(updates) &&
            updates.every(
                (item) =>
                    item !== null &&
                    typeof item === "object" &&
                    typeof item.key === "string" &&
                    typeof item.completed === "boolean"
            );
        if (!validShape) {
            return res.status(400).json({
                success: false,
                message: "Items must be an array of objects with a string key and boolean completed"
            });
        }

        const checklist = await Checklist.findOne({ _id: checklistId, userId });
        if (!checklist) {
            return res.status(404).json({ success: false, message: "Checklist not found" });
        }

        for (const update of updates) {
            const target = checklist.items.find((item) => item.key === update.key);
            if (!target) {
                return res.status(400).json({
                    success: false,
                    message: `Unknown checklist item: ${update.key}`
                });
            }
            target.completed = update.completed;
            target.completedAt = update.completed ? new Date() : null;
        }

        await checklist.save();

        const scheme = await Scheme.findById(checklist.schemeId).select("name").lean();

        return res.status(200).json({
            success: true,
            message: "Checklist updated",
            data: {
                scheme: scheme ? toSchemeView(scheme) : null,
                checklist: toChecklistView(checklist.toObject())
            }
        });
    } catch (err) {
        return handleChecklistError(err, res, next);
    }
};
