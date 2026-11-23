const STATES = [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
    "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
    "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
    "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
    "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
    "Andaman and Nicobar Islands", "Chandigarh",
    "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir",
    "Ladakh", "Lakshadweep", "Puducherry"
];

const PURPOSE_RULES = [
    { value: "Education", pattern: /\b(education|study|studies|scholarship|school|college|university)\b/i },
    { value: "Healthcare", pattern: /\b(health|medical|treatment|hospital|medicine)\b/i },
    { value: "Housing", pattern: /\b(house|housing|home|shelter)\b/i },
    { value: "Employment", pattern: /\b(job|employment|work|livelihood)\b/i }
];

const MISSING_LABELS = [
    ["state", "State"],
    ["educationLevel", "Education level"],
    ["annualFamilyIncome", "Annual family income"],
    ["occupation", "Occupation"],
    ["purpose", "Purpose"]
];

const INCOME_MULTIPLIERS = {
    thousand: 1000,
    lakh: 100000,
    lakhs: 100000,
    crore: 10000000
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const findState = (text) => {
    const match = STATES.find((state) =>
        new RegExp(`\\b${escapeRegex(state)}\\b`, "i").test(text)
    );
    return match || null;
};

const findEducationLevel = (text) => (/\bstudent\b/i.test(text) ? "Student" : null);

const findOccupation = (text) => {
    const match = text.match(/\b(?:work(?:s|ing)? as|occupation(?: is)?|profession(?: is)?|job(?: is)?)\s+(?:an?\s+|the\s+)?([a-z][a-z ]{2,40}?)(?=[.,;!?]|\s+(?:and|in|from|with|at|for)\b|$)/i);
    return match ? match[1].trim() : null;
};

const findPurpose = (text) => {
    const rule = PURPOSE_RULES.find((item) => item.pattern.test(text));
    return rule ? rule.value : null;
};

const findAnnualIncome = (text) => {
    if (!/income/i.test(text)) {
        return null;
    }
    const match = text.match(/(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d+)?)\s*(lakhs?|thousand|crore)?/i);
    if (!match) {
        return null;
    }
    const amount = parseFloat(match[1].replace(/,/g, ""));
    if (Number.isNaN(amount)) {
        return null;
    }
    const multiplier = match[2] ? INCOME_MULTIPLIERS[match[2].toLowerCase()] : 1;
    return amount * multiplier;
};

const findOtherInfo = (text, purpose) => {
    const notes = [];
    if (/\blow[- ]income\b/i.test(text)) {
        notes.push("Low income family");
    }
    if (/\b(financial support|financial help|financial assistance)\b/i.test(text)) {
        notes.push(purpose
            ? `Needs financial support for ${purpose.toLowerCase()}`
            : "Needs financial support");
    }
    return notes.length > 0 ? notes.join("; ") : null;
};

// Deterministic fallback extraction. Only explicitly stated information is returned;
// anything not stated stays null.
const extractProfile = (text) => {
    const profile = {
        state: findState(text),
        educationLevel: findEducationLevel(text),
        annualFamilyIncome: findAnnualIncome(text),
        occupation: findOccupation(text),
        purpose: findPurpose(text),
        otherInfo: null
    };
    profile.otherInfo = findOtherInfo(text, profile.purpose);

    const missingInformation = MISSING_LABELS
        .filter(([key]) => profile[key] === null)
        .map(([, label]) => label);

    return { profile, missingInformation };
};

module.exports = { extractProfile };
