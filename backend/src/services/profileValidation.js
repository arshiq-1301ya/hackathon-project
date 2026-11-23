const STRING_FIELD_LIMITS = {
    state: 100,
    educationLevel: 100,
    purpose: 200,
    occupation: 100,
    otherInfo: 1000
};

const CANONICAL_FIELDS = [
    "state",
    "educationLevel",
    "annualFamilyIncome",
    "purpose",
    "occupation",
    "landStatus",
    "otherInfo"
];

const LAND_STATUS_VALUES = ["landholding", "landless"];

const isPlainObject = (value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
};

const parseIncome = (value) => {
    if (value === null) {
        return { ok: true, value: null };
    }
    let candidate = value;
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed === "") {
            return { ok: false };
        }
        candidate = Number(trimmed);
    }
    if (typeof candidate !== "number" || !Number.isFinite(candidate) || candidate < 0) {
        return { ok: false };
    }
    return { ok: true, value: candidate };
};

// Validates a profile update body and returns only the canonical keys present in it.
// Never spread the raw body into a database update.
const validateProfileUpdate = (body) => {
    if (!isPlainObject(body)) {
        return { ok: false, message: "Request body must be a JSON object" };
    }

    const keys = Object.keys(body);
    for (const key of keys) {
        if (!CANONICAL_FIELDS.includes(key)) {
            return { ok: false, message: `Unknown field: ${key}` };
        }
    }

    const updates = {};
    for (const key of keys) {
        const value = body[key];

        if (key === "annualFamilyIncome") {
            const parsed = parseIncome(value);
            if (!parsed.ok) {
                return {
                    ok: false,
                    message: "annualFamilyIncome must be null or a number greater than or equal to 0"
                };
            }
            updates[key] = parsed.value;
            continue;
        }

        if (key === "landStatus") {
            if (value === null) {
                updates[key] = null;
                continue;
            }
            const normalized = typeof value === "string" ? value.trim().toLowerCase() : null;
            if (!LAND_STATUS_VALUES.includes(normalized)) {
                return {
                    ok: false,
                    message: 'landStatus must be null, "landholding" or "landless"'
                };
            }
            updates[key] = normalized;
            continue;
        }

        const max = STRING_FIELD_LIMITS[key];
        if (typeof value !== "string") {
            return { ok: false, message: `${key} must be a string` };
        }
        const trimmed = value.trim();
        if (trimmed.length > max) {
            return { ok: false, message: `${key} must be ${max} characters or fewer` };
        }
        updates[key] = trimmed;
    }

    return { ok: true, updates };
};

module.exports = { validateProfileUpdate, CANONICAL_FIELDS };
