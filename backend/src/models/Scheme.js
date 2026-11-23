const mongoose = require("mongoose");

const eligibilitySchema = new mongoose.Schema(
    {
        field: {
            type: String,
            required: true,
            enum: [
                "state",
                "educationLevel",
                "annualFamilyIncome",
                "occupation",
                "category",
                "age",
                "gender",
                "disability",
                "landStatus"
            ]
        },

        operator: {
            type: String,
            required: true,
            enum: [
                "eq",
                "in",
                "lte",
                "gte"
            ]
        },

        value: {
            type: mongoose.Schema.Types.Mixed,
            default: null
        },

        description: {
            type: String,
            default: ""
        }
    },
    {
        _id: false
    }
);

const schemeSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },

        slug: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },

        description: {
            type: String,
            required: true
        },

        category: {
            type: String,
            required: true,
            enum: [
                "Education",
                "Healthcare",
                "Housing",
                "Employment",
                "Agriculture",
                "Financial Support",
                "Other"
            ]
        },

        benefits: {
            type: [String],
            default: []
        },

        eligibility: {
            type: [eligibilitySchema],
            default: []
        },

        requiredDocuments: {
            type: [String],
            default: []
        },

        applicationSteps: {
            type: [String],
            default: []
        },

        deadline: {
            type: Date,
            default: null
        },

        officialSource: {
            type: String,
            default: null,
            trim: true
        },

        lastVerified: {
            type: Date,
            default: null
        },

        verificationStatus: {
            type: String,
            enum: [
                "unverified",
                "verified",
                "needs_review"
            ],
            default: "unverified"
        },

        isActive: {
            type: Boolean,
            default: true
        }
    },

    {
        timestamps: true
    }
);

schemeSchema.pre("validate", function () {
    if (this.verificationStatus === "verified") {
        if (!this.officialSource) {
            this.invalidate(
                "officialSource",
                "officialSource is required when verificationStatus is verified"
            );
        }

        if (!this.lastVerified) {
            this.invalidate(
                "lastVerified",
                "lastVerified is required when verificationStatus is verified"
            );
        }
    }
});

module.exports = mongoose.model(
    "Scheme",
    schemeSchema
);
