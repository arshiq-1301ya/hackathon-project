const mongoose = require("mongoose");

const checklistItemSchema = new mongoose.Schema(
    {
        key: {
            type: String,
            required: true,
            trim: true
        },
        label: {
            type: String,
            required: true,
            trim: true
        },
        completed: {
            type: Boolean,
            default: false
        },
        completedAt: {
            type: Date,
            default: null
        }
    },
    { _id: false }
);

const checklistSchema = new mongoose.Schema(
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
        items: {
            type: [checklistItemSchema],
            default: []
        }
    },
    { timestamps: true }
);

checklistSchema.index({ userId: 1, schemeId: 1 }, { unique: true });

module.exports = mongoose.model("Checklist", checklistSchema);
