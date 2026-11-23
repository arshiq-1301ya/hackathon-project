const Application = require("../models/Application");

const DAY_MS = 86400000;
const EXCLUDED_STATUSES = ["submitted", "approved", "rejected"];

const getAuthUserId = (req) => req.userId || (req.user && req.user.id) || null;

const buildReminder = (application, now) => {
    const schemeName = application.schemeId.name;
    const base = {
        applicationId: application._id,
        schemeId: application.schemeId._id,
        schemeName,
        status: application.status,
        deadline: application.deadline || null
    };

    if (application.deadline) {
        const deadline = new Date(application.deadline);
        if (deadline < now) {
            return {
                ...base,
                daysRemaining: Math.ceil((deadline - now) / DAY_MS),
                type: "overdue",
                message: `Deadline for ${schemeName} has passed`
            };
        }

        const daysRemaining = Math.ceil((deadline - now) / DAY_MS);
        if (daysRemaining <= 7) {
            return {
                ...base,
                daysRemaining,
                type: "due_soon",
                message: `${schemeName} deadline in ${daysRemaining} days`
            };
        }
        if (daysRemaining <= 30) {
            return {
                ...base,
                daysRemaining,
                type: "upcoming",
                message: `${schemeName} deadline in ${daysRemaining} days`
            };
        }
        return null;
    }

    if (application.status === "not_started") {
        return {
            ...base,
            daysRemaining: null,
            type: "action_needed",
            message: `Start your application for ${schemeName}`
        };
    }

    return null;
};

// Overdue first, then deadline ascending with nulls last
const compareReminders = (a, b) => {
    const aOverdue = a.type === "overdue" ? 0 : 1;
    const bOverdue = b.type === "overdue" ? 0 : 1;
    if (aOverdue !== bOverdue) return aOverdue - bOverdue;

    if (a.deadline && b.deadline) return new Date(a.deadline) - new Date(b.deadline);
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return 0;
};

exports.getReminders = async (req, res, next) => {
    try {
        const userId = getAuthUserId(req);
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const now = new Date();
        const applications = await Application.find({ userId })
            .populate("schemeId", "name")
            .lean();

        const reminders = applications
            .filter((application) => application.schemeId && !EXCLUDED_STATUSES.includes(application.status))
            .map((application) => buildReminder(application, now))
            .filter((reminder) => reminder !== null)
            .sort(compareReminders);

        return res.status(200).json({
            success: true,
            message: "Reminders fetched",
            data: {
                reminders,
                count: reminders.length
            }
        });
    } catch (err) {
        return next(err);
    }
};
