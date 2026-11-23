// Guardrail: never collect Aadhaar / PAN / bank / card numbers.
const toAsciiDigits = (text) =>
    String(text).replace(/[\u0966-\u096F]/g, (ch) => String(ch.charCodeAt(0) - 0x966));

const PATTERNS = [
    /(?<!\d)\d{4}[\s-]?\d{4}[\s-]?\d{4}(?!\d)/,   // Aadhaar-style 12 digits
    /\b[A-Za-z]{5}\d{4}[A-Za-z]\b/,                // PAN
    /(?<!\d)(?:\d[\s-]?){13,19}(?!\d)/             // card / account like
];

const containsSensitiveId = (text) => {
    if (typeof text !== "string") return false;
    const normalised = toAsciiDigits(text);
    return PATTERNS.some((pattern) => pattern.test(normalised));
};

const SENSITIVE_ID_MESSAGE =
    "Please remove Aadhaar, PAN, bank or card numbers from your message. This service never needs ID numbers.";

module.exports = { containsSensitiveId, SENSITIVE_ID_MESSAGE };