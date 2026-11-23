const { matchSchemes } = require("./schemeMatchService");

const PROFILE_FIELDS = [
    "state",
    "educationLevel",
    "annualFamilyIncome",
    "purpose",
    "occupation",
    "landStatus",
    "otherInfo"
];

const cleanText = (value) => {
    if (typeof value !== "string") {
        return "";
    }

    return value.trim();
};

const normalizeProfile = (profile = {}) => {
    const normalized = {};

    for (const field of PROFILE_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(profile, field)) {
            normalized[field] = profile[field];
        }
    }

    return normalized;
};

const buildProfileSummary = (profile) => {
    const parts = [];

    if (profile.state) {
        parts.push(`State: ${profile.state}`);
    }

    if (profile.educationLevel) {
        parts.push(`Education: ${profile.educationLevel}`);
    }

    if (
        profile.annualFamilyIncome !== null &&
        profile.annualFamilyIncome !== undefined &&
        profile.annualFamilyIncome !== ""
    ) {
        parts.push(`Annual family income: ${profile.annualFamilyIncome}`);
    }

    if (profile.occupation) {
        parts.push(`Occupation: ${profile.occupation}`);
    }

    if (profile.landStatus) {
        parts.push(`Land status: ${profile.landStatus}`);
    }

    if (profile.purpose) {
        parts.push(`Purpose: ${profile.purpose}`);
    }

    if (profile.otherInfo) {
        parts.push(`Other information: ${profile.otherInfo}`);
    }

    return parts.length > 0
        ? parts.join("\n")
        : "No structured profile information is available.";
};

const buildRuleEngineResult = (schemes, profile) => {
    const results = matchSchemes(schemes, profile);

    const likelyEligible = results.filter(
        (item) => item.status === "likely_eligible"
    );

    const possibleMatches = results.filter(
        (item) => item.status === "possible_match"
    );

    return {
        profile,
        totalSchemesEvaluated: results.length,
        likelyEligible,
        possibleMatches,
        allResults: results
    };
};

const buildGeminiPrompt = (userMessage, ruleResult) => {
    const candidateResults = [
        ...ruleResult.likelyEligible,
        ...ruleResult.possibleMatches
    ];

    const candidateData = candidateResults.map((item) => ({
        name: item.scheme.name,
        slug: item.scheme.slug,
        category: item.scheme.category,
        status: item.status,
        matchedConditions: item.matchedConditions,
        unmatchedConditions: item.unmatchedConditions,
        missingInformation: item.missingInformation,
        reasoning: item.reasoning,
        benefits: item.scheme.benefits,
        requiredDocuments: item.scheme.requiredDocuments,
        applicationSteps: item.scheme.applicationSteps,
        officialSource: item.scheme.officialSource,
        deadline: item.scheme.deadline,
        lastVerified: item.scheme.lastVerified,
        verificationStatus: item.scheme.verificationStatus
    }));

    return `
You are Nexen, an AI assistant for a government scheme discovery application.

Your job is NOT to decide eligibility.
The backend rule engine has already evaluated the scheme rules.

You must only explain the backend results clearly to the user.

STRICT RULES:

1. Never say "guaranteed eligible".
2. Use "likely eligible" or "possibly eligible".
3. Never invent an eligibility rule.
4. Never invent a document.
5. Never invent an application step.
6. Never invent a deadline.
7. Never invent an official website.
8. Use only the backend data provided below.
9. Clearly distinguish missing information from unmet criteria.
10. If a scheme has no configured eligibility rules, do not claim eligibility.
11. Never request Aadhaar numbers, bank account numbers, OTPs, passwords or other sensitive ID numbers.
12. Mention that final eligibility is decided by the official scheme authority.
13. Reply in the same language as the USER MESSAGE (Hindi, English or Hinglish), keeping scheme names and official links unchanged.
14. If there are no candidates, explain that no current match was found from the available scheme data.

USER MESSAGE:
${userMessage}

STRUCTURED PROFILE:
${buildProfileSummary(ruleResult.profile)}

BACKEND RULE-ENGINE RESULTS:
${JSON.stringify(candidateData, null, 2)}

Respond in a clear, concise format:

Nexen

I understood your situation as:
- ...

Potential scheme matches:

1. Scheme name
Status: Likely eligible / Possibly eligible
Why it matches:
- ...
Missing information:
- ...
Documents:
- ...
How to apply:
- ...
Official source:
- ...
Verification:
- ...

End with:
"Final eligibility is decided by the official scheme authority."
`;
};

module.exports = {
    normalizeProfile,
    buildProfileSummary,
    buildRuleEngineResult,
    buildGeminiPrompt
};
