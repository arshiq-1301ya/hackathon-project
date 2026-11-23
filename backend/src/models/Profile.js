const mongoose = require("mongoose");

const profileSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true
        },
        state: {
            type: String,
            trim: true,
            maxlength: 100,
            default: ""
        },
        educationLevel: {
            type: String,
            trim: true,
            maxlength: 100,
            default: ""
        },
        annualFamilyIncome: {
            type: Number,
            min: 0,
            default: null,
            validate: {
                validator: (value) => value === null || Number.isFinite(value),
                message: "annualFamilyIncome must be a finite number or null"
            }
        },
        purpose: {
            type: String,
            trim: true,
            maxlength: 200,
            default: ""
        },
        occupation: {
            type: String,
            trim: true,
            maxlength: 100,
            default: ""
        },
        // null = not provided; matching treats null as missing, never as a match.
        landStatus: {
            type: String,
            enum: ["landholding", "landless", null],
            default: null
        },
        otherInfo: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: ""
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Profile", profileSchema);
