require("dotenv").config();

const connectDB = require("../config/db");
const mongoose = require("mongoose");
const Scheme = require("../models/Scheme");
const schemes = require("../data/schemes");

const seedSchemes = async () => {
    try {
        await connectDB();

        const RETIRED_SLUGS = [
            "national-scholarship-portal"
        ];

        const retired = await Scheme.updateMany(
            {
                slug: {
                    $in: RETIRED_SLUGS
                }
            },
            {
                $set: {
                    isActive: false
                },
                $pull: {
                    eligibility: {
                        value: null
                    }
                }
            }
        );

        let inserted = 0;
        let updated = 0;

        for (const scheme of schemes) {
            const {
                name,
                description,
                category,
                officialSource,
                benefits,
                requiredDocuments,
                applicationSteps,
                eligibility,
                deadline,
                isActive,
                lastVerified,
                verificationStatus
            } = scheme;

            /*
             * Content fields are refreshed on every seed run.
             *
             * Verification metadata is intentionally NOT refreshed
             * for existing documents. This prevents an ordinary seed
             * operation from falsely changing the verification date/status.
             *
             * For newly inserted schemes, verification metadata comes
             * directly from the seed data.
             */
            const $set = {
                name,
                description,
                category,
                officialSource,
                benefits,
                requiredDocuments,
                applicationSteps,
                eligibility,
                deadline,
                isActive
            };

            const $setOnInsert = {};

            if (lastVerified !== undefined) {
                $setOnInsert.lastVerified = lastVerified;
            }

            if (verificationStatus !== undefined) {
                $setOnInsert.verificationStatus =
                    verificationStatus;
            }

            const result = await Scheme.updateOne(
                {
                    slug: scheme.slug
                },
                {
                    $set,
                    $setOnInsert
                },
                {
                    upsert: true
                }
            );

            if (result.upsertedCount > 0) {
                inserted++;
            } else {
                updated++;
            }
        }

        console.log(
            `Seed complete: ${inserted} inserted, ${updated} updated`
        );

        console.log(
            `Retired schemes deactivated: ${retired.modifiedCount}`
        );

        await mongoose.disconnect();

        process.exit(0);

    } catch (error) {
        console.error(
            "Seed failed:",
            error.message
        );

        process.exit(1);
    }
};

seedSchemes();
