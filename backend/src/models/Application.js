const mongoose = require("mongoose");

const APPLICATION_STATUSES = ["not_started", "in_progress", "submitted", "approved", "rejected"];

const applicationSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },
        schemeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Scheme",
            required: true
        },
        status: {
            type: String,
            enum: APPLICATION_STATUSES,
            default: "not_started"
        },
        deadline: {
            type: Date,
            default: null
        },
        notes: {
            type: String,
            trim: true,
            maxlength: 2000,
            default: ""
        },
        trackingNumber: {
            type: String,
            trim: true,
            maxlength: 100,
            default: ""
        },
        submittedAt: {
            type: Date,
            default: null
        }
    },
    { timestamps: true }
);

applicationSchema.index({ userId: 1, schemeId: 1 }, { unique: true });

module.exports = mongoose.model("Application", applicationSchema);
module.exports.APPLICATION_STATUSES = APPLICATION_STATUSES;
