// Pure, DB-free scheme eligibility evaluation.
// Empty eligibility or null rule values mean "not recorded", never "no requirements".

const PROFILE_FIELDS = [
    "state",
    "educationLevel",
    "annualFamilyIncome",
    "purpose",
    "occupation",
    "otherInfo",
    "landStatus"
];

const FIELD_LABELS = {
    state: "state",
    educationLevel: "education level",
    annualFamilyIncome: "annual family income",
    purpose: "purpose",
    occupation: "occupation",
    otherInfo: "other information",
    landStatus: "land status"
};

const OPERATOR_SYMBOLS = {
    eq: "=",
    lte: "<=",
    gte: ">="
};

const SCHEME_OUTPUT_FIELDS = [
    "_id",
    "name",
    "slug",
    "category",
    "officialSource",
    "lastVerified",
    "verificationStatus",
    "deadline",
    "benefits",
    "requiredDocuments",
    "applicationSteps"
];

const SCHEME_ARRAY_FIELDS = ["benefits", "requiredDocuments", "applicationSteps"];

const DISCLAIMER =
    "This is an indicative check based on the information provided; the official scheme authority decides final eligibility.";

const VERIFICATION_NOTE =
    "Eligibility rules and official source not yet verified against the official portal; treat this as a guide only.";

const isBlank = (value) =>
    value === null || value === undefined || (typeof value === "string" && value.trim() === "");

const toNumber = (value) => {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value.trim());
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};

const normalizeText = (value) => String(value).trim().toLowerCase();

const valuesEqual = (a, b) => {
    const numA = toNumber(a);
    const numB = toNumber(b);
    if (numA !== null && numB !== null) {
        return numA === numB;
    }
    return normalizeText(a) === normalizeText(b);
};

const formatValue = (value) => {
    if (Array.isArray(value)) {
        return `[${value.join(", ")}]`;
    }
    return String(value);
};

const conditionText = (rule) => {
    const description = typeof rule.description === "string" ? rule.description.trim() : "";
    if (description) {
        return description;
    }
    const operator = OPERATOR_SYMBOLS[rule.operator] || rule.operator;
    return `${rule.field} ${operator} ${formatValue(rule.value)}`;
};

// Returns "matched", "unmatched" or "missing" for one eligibility rule.
const evaluateRule = (rule, profile) => {
    const { field, operator, value } = rule;

    if (!PROFILE_FIELDS.includes(field)) {
        return "missing";
    }

    const profileValue = profile[field];
    if (isBlank(profileValue) || isBlank(value)) {
        return "missing";
    }

    switch (operator) {
        case "eq":
            return valuesEqual(profileValue, value) ? "matched" : "unmatched";
        case "in": {
            if (!Array.isArray(value)) {
                return "missing";
            }
            const candidates = value.filter((item) => !isBlank(item));
            return candidates.some((item) => valuesEqual(profileValue, item))
                ? "matched"
                : "unmatched";
        }
        case "lte":
        case "gte": {
            const profileNumber = toNumber(profileValue);
            const ruleNumber = toNumber(value);
            if (profileNumber === null || ruleNumber === null) {
                return "missing";
            }
            const ok = operator === "lte" ? profileNumber <= ruleNumber : profileNumber >= ruleNumber;
            return ok ? "matched" : "unmatched";
        }
        default:
            return "missing";
    }
};

const addUnique = (list, item) => {
    if (!list.includes(item)) {
        list.push(item);
    }
};

const pickScheme = (scheme) => {
    const output = {};
    for (const key of SCHEME_OUTPUT_FIELDS) {
        const value = scheme[key];
        if (value !== undefined) {
            output[key] = value;
        } else {
            output[key] = SCHEME_ARRAY_FIELDS.includes(key) ? [] : null;
        }
    }
    return output;
};

const fieldLabel = (field) => FIELD_LABELS[field] || field;

// One reasoning sentence per evaluated rule; keeps the rule's field, operator and value.
const describeRule = (rule, profile, outcome) => {
    const field = String(rule.field);
    const operator = OPERATOR_SYMBOLS[rule.operator] || rule.operator;
    if (outcome === "matched") {
        return `Matched: your ${fieldLabel(field)} is ${formatValue(profile[field])} (rule: ${field} ${operator} ${formatValue(rule.value)}).`;
    }
    if (outcome === "unmatched") {
        return `Not matched: ${field} is ${formatValue(profile[field])}, but the rule requires ${operator} ${formatValue(rule.value)}.`;
    }
    return `Not yet provided: ${field} (needed to check: ${formatValue(rule.value)}).`;
};

const buildReasoning = (status, ruleLines, missing) => {
    const parts = [];

    if (status === "likely_eligible") {
        parts.push("Likely eligible because all recorded criteria are met.");
    } else if (status === "not_matched") {
        parts.push("Not matched: the information provided does not meet at least one recorded criterion.");
    } else if (status === "no_configured_rules") {
        parts.push(
            "Eligibility criteria for this scheme are not yet recorded, so eligibility cannot be confirmed. Please check the official source before applying."
        );
    } else {
        parts.push(
            `You are not yet confirmed as likely eligible. More information is needed to check: ${missing.join(", ")}.`
        );
    }

    parts.push(...ruleLines);
    parts.push(DISCLAIMER);
    return parts.join(" ");
};

// Evaluates one scheme against a profile and returns its status and condition breakdown.
const evaluateScheme = (scheme, profile) => {
    const safeScheme = scheme && typeof scheme === "object" ? scheme : {};
    const safeProfile = profile && typeof profile === "object" ? profile : {};
    const rules = Array.isArray(safeScheme.eligibility) ? safeScheme.eligibility : [];

    const matchedConditions = [];
    const unmatchedConditions = [];
    const missingInformation = [];
    const ruleLines = [];

    for (const rawRule of rules) {
        const rule = rawRule && typeof rawRule === "object" ? rawRule : {};
        const outcome = evaluateRule(rule, safeProfile);
        ruleLines.push(describeRule(rule, safeProfile, outcome));

        if (outcome === "matched") {
            matchedConditions.push(conditionText(rule));
        } else if (outcome === "unmatched") {
            unmatchedConditions.push(conditionText(rule));
        } else {
            addUnique(missingInformation, String(rule.field));
        }
    }

    let status;
    if (unmatchedConditions.length > 0) {
        status = "not_matched";
    } else if (rules.length === 0) {
        status = "no_configured_rules";
    } else if (missingInformation.length > 0) {
        status = "possible_match";
    } else {
        status = "likely_eligible";
    }

    const result = {
        scheme: pickScheme(safeScheme),
        status,
        matchedConditions,
        unmatchedConditions,
        missingInformation,
        reasoning: buildReasoning(status, ruleLines, missingInformation)
    };

    if (safeScheme.verificationStatus !== "verified") {
        result.verificationNote = VERIFICATION_NOTE;
    }

    return result;
};


// Evaluates every scheme in the given order.
const matchSchemes = (schemes, profile) => {
    const list = Array.isArray(schemes) ? schemes : [];
    return list.map((scheme) => evaluateScheme(scheme, profile));
};

module.exports = { evaluateScheme, matchSchemes };
