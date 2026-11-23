// Turns a plain-language description (English / Hindi / Hinglish) into a structured profile.
// 1) Gemini (if configured) returns JSON, which is validated strictly.
// 2) A deterministic rules extractor is the fallback and also fills gaps Gemini leaves empty.
// Only explicitly stated information is returned; anything not stated stays null.

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

const STATE_HINDI = {
    "उत्तर प्रदेश": "Uttar Pradesh", "यूपी": "Uttar Pradesh", "बिहार": "Bihar",
    "महाराष्ट्र": "Maharashtra", "तमिलनाडु": "Tamil Nadu", "पश्चिम बंगाल": "West Bengal",
    "मध्य प्रदेश": "Madhya Pradesh", "राजस्थान": "Rajasthan", "गुजरात": "Gujarat",
    "कर्नाटक": "Karnataka", "केरल": "Kerala", "पंजाब": "Punjab", "हरियाणा": "Haryana",
    "उत्तराखंड": "Uttarakhand", "झारखंड": "Jharkhand", "छत्तीसगढ़": "Chhattisgarh",
    "ओडिशा": "Odisha", "उड़ीसा": "Odisha", "असम": "Assam", "दिल्ली": "Delhi",
    "तेलंगाना": "Telangana", "आंध्र प्रदेश": "Andhra Pradesh"
};

const EDUCATION_RULES = [
    { value: "Postgraduate", pattern: /post[- ]?graduate|masters?|m\.?a\b|m\.?sc\b|m\.?com\b|परास्नातक|स्नातकोत्तर/i },
    { value: "Graduate", pattern: /graduate|graduation|b\.?a\b|b\.?sc\b|b\.?com\b|b\.?tech|ग्रेजुएट|स्नातक/i },
    { value: "Diploma / ITI", pattern: /diploma|\biti\b|डिप्लोमा|आईटीआई/i },
    { value: "12th pass", pattern: /\b12(th)?\b|intermediate|बारहवीं|इंटर/i },
    { value: "10th pass", pattern: /\b10(th)?\b|matric|दसवीं|हाईस्कूल/i },
    { value: "Below 10th", pattern: /illiterate|uneducated|\b(?:[5-9])(?:th)?\s*(?:pass|class|standard)|अनपढ़|आठवीं|पाँचवीं/i }
];

const OCCUPATION_RULES = [
    { value: "Farmer", pattern: /farmer|farming|kisan|cultivat|किसान|खेती/i },
    { value: "Student", pattern: /student|छात्र|विद्यार्थी|पढ़ाई कर/i },
    { value: "Daily wage worker", pattern: /daily[- ]wage|dihadi|दिहाड़ी/i },
    { value: "Labourer", pattern: /labou?rer|majdoor|मजदूर|मज़दूर/i },
    { value: "Shopkeeper", pattern: /shopkeeper|दुकानदार/i },
    { value: "Unemployed", pattern: /unemployed|jobless|बेरोजगार|बेरोज़गार/i }
];

const PURPOSE_RULES = [
    { value: "Agriculture", pattern: /\b(farm|farmer|kisan|crop|agricultur)|किसान|खेती|फसल/i },
    { value: "Education", pattern: /\b(education|study|studies|scholarship|school|college|university|fees?)\b|छात्रवृत्ति|स्कॉलरशिप|पढ़ाई|फीस/i },
    { value: "Health", pattern: /\b(health|medical|treatment|hospital|medicine|insurance)\b|इलाज|अस्पताल|स्वास्थ्य|बीमा/i },
    { value: "Housing", pattern: /\b(house|housing|shelter)\b|मकान|आवास/i },
    { value: "Employment / job", pattern: /\b(job|employment|livelihood)\b|रोजगार|नौकरी/i }
];

const LANDLESS = /landless|no land|without land|don'?t (?:own|have) (?:any )?land|भूमिहीन|(?:ज़मीन|जमीन|खेत)\s*(?:नहीं|नही)/i;
const LANDHOLDING = /(?:own|owns|have|has|hold|holds)\s+(?:about\s+)?(?:\d+(?:\.\d+)?\s*)?(?:acres?|bigha|hectares?|agricultural land|farm ?land|land)|\d+(?:\.\d+)?\s*(?:acres?|bigha|hectares?|बीघा|एकड़|हेक्टेयर)|(?:ज़मीन|जमीन|खेत)\s*(?:है|हैं)|अपनी (?:ज़मीन|जमीन|खेती)/i;

const INCOME_CONTEXT = /income|annual|salary|earn|आय|कमाई|वार्षिक|सालाना|आमदनी/i;
const INCOME_UNITS = [
    { pattern: /^(crore|करोड़)$/i, factor: 10000000 },
    { pattern: /^(lakhs?|लाख)$/i, factor: 100000 },
    { pattern: /^(thousand|हजार|हज़ार|hazar|k)$/i, factor: 1000 }
];

const toAsciiDigits = (text) =>
    String(text).replace(/[\u0966-\u096F]/g, (ch) => String(ch.charCodeAt(0) - 0x966));

const firstMatch = (text, rules) => {
    const rule = rules.find((item) => item.pattern.test(text));
    return rule ? rule.value : null;
};

const findState = (text) => {
    const lower = text.toLowerCase();
    const english = STATES.find((state) =>
        new RegExp(`(^|[^a-z])${state.toLowerCase()}($|[^a-z])`, "i").test(lower)
    );
    if (english) return english;
    if (/(^|[^a-z])u\.?p\.?($|[^a-z])/i.test(text)) return "Uttar Pradesh";
    const hindi = Object.keys(STATE_HINDI).find((term) => text.includes(term));
    return hindi ? STATE_HINDI[hindi] : null;
};

const findAnnualIncome = (text) => {
    const hasContext = INCOME_CONTEXT.test(text);
    const pattern = /(?:rs\.?|inr|₹)?\s*(\d[\d,]*(?:\.\d+)?)\s*(crore|करोड़|lakhs?|लाख|thousand|हजार|हज़ार|hazar|k)?(\s*(?:th|st|nd|rd)\b)?/gi;
    let match;
    while ((match = pattern.exec(text)) !== null) {
        if (match[3]) continue; // ordinal like 12th
        const unit = match[2] || "";
        const hasCurrency = /(?:rs\.?|inr|₹)\s*$/i.test(text.slice(Math.max(0, match.index - 1), match.index + 1)) || /^(?:rs\.?|inr|₹)/i.test(match[0].trim());
        if (!unit && !hasContext && !hasCurrency) continue;
        const amount = parseFloat(match[1].replace(/,/g, ""));
        if (!Number.isFinite(amount)) continue;
        const after = text.slice(match.index + match[0].length, match.index + match[0].length + 12);
        if (!unit && /^\s*(?:acres?|bigha|hectares?|years?|yrs?|साल|वर्ष|बीघा|एकड़)/i.test(after)) continue;
        const rule = INCOME_UNITS.find((item) => item.pattern.test(unit));
        return Math.round(amount * (rule ? rule.factor : 1));
    }
    return null;
};

const findOtherInfo = (text) => {
    const notes = [];
    if (/\blow[- ]income\b|गरीब/i.test(text)) notes.push("Low income family");
    if (/\bwidow\b|विधवा/i.test(text)) notes.push("Widow");
    if (/\bsenior citizen\b|वरिष्ठ नागरिक|बुजुर्ग/i.test(text)) notes.push("Senior citizen");
    return notes.length > 0 ? notes.join("; ") : null;
};

// Deterministic extraction (English / Hindi / Hinglish).
const extractProfileByRules = (rawText) => {
    const text = toAsciiDigits(rawText);
    const occupation = firstMatch(text, OCCUPATION_RULES);
    let landStatus = null;
    if (LANDLESS.test(text)) landStatus = "landless";
    else if (LANDHOLDING.test(text)) landStatus = "landholding";

    return {
        state: findState(text),
        educationLevel: firstMatch(text, EDUCATION_RULES),
        annualFamilyIncome: findAnnualIncome(text),
        purpose: firstMatch(text, PURPOSE_RULES),
        occupation,
        landStatus,
        otherInfo: findOtherInfo(text)
    };
};

const MISSING_LABELS = [
    ["state", "State"],
    ["educationLevel", "Education level"],
    ["annualFamilyIncome", "Annual family income"],
    ["occupation", "Occupation"],
    ["purpose", "Purpose"]
];

const buildMissing = (profile) => {
    const missing = MISSING_LABELS.filter(([key]) => profile[key] === null).map(([, label]) => label);
    if (profile.occupation && /farmer/i.test(profile.occupation) && profile.landStatus === null) {
        missing.push("Land status (own land or landless)");
    }
    return missing;
};

// Validates whatever Gemini returned; anything doubtful becomes null.
const sanitiseModelProfile = (raw) => {
    const out = { state: null, educationLevel: null, annualFamilyIncome: null, purpose: null, occupation: null, landStatus: null, otherInfo: null };
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;

    const text = (value, max) =>
        typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

    if (typeof raw.state === "string") {
        const match = STATES.find((s) => s.toLowerCase() === raw.state.trim().toLowerCase());
        out.state = match || null;
    }
    out.educationLevel = text(raw.educationLevel, 100);
    out.purpose = text(raw.purpose, 200);
    out.occupation = text(raw.occupation, 100);
    out.otherInfo = text(raw.otherInfo, 1000);

    const income = typeof raw.annualFamilyIncome === "string" ? Number(raw.annualFamilyIncome.replace(/,/g, "")) : raw.annualFamilyIncome;
    if (typeof income === "number" && Number.isFinite(income) && income >= 0 && income < 1e10) {
        out.annualFamilyIncome = Math.round(income);
    }
    if (typeof raw.landStatus === "string" && ["landholding", "landless"].includes(raw.landStatus.trim().toLowerCase())) {
        out.landStatus = raw.landStatus.trim().toLowerCase();
    }
    return out;
};

const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const MODEL_TIMEOUT_MS = 8000;

let aiClient = null;
const getClient = () => {
    if (aiClient || !process.env.GEMINI_API_KEY) return aiClient;
    try {
        const { GoogleGenAI } = require("@google/genai");
        aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    } catch (err) {
        aiClient = null;
    }
    return aiClient;
};

const buildExtractionPrompt = (text) => `
You extract a structured profile from a citizen's plain-language description (English, Hindi or Hinglish)
for an Indian government-scheme eligibility tool.

Rules:
- Use ONLY what the person explicitly states. If something is not stated, use null. Never guess.
- Never output any ID number (Aadhaar, PAN, bank, phone).
- "state" must be the English name of an Indian state/UT, or null.
- "educationLevel": one of "Below 10th", "10th pass", "12th pass", "Graduate", "Postgraduate", "Diploma / ITI", "Other", or null.
- "annualFamilyIncome": number of rupees per year (convert lakh = 100000), or null.
- "occupation": short English noun such as "Farmer", "Student", "Daily wage worker", or null.
- "purpose": one of "Education", "Employment / job", "Livelihood / business", "Agriculture", "Health", "Housing", "Women and child welfare", "Other", or null.
- "landStatus": "landholding" if they own agricultural land, "landless" if they say they have none, otherwise null.
- "otherInfo": short English note on other relevant facts (e.g. "Widow", "Senior citizen"), or null.

Return ONLY a JSON object with exactly these keys:
state, educationLevel, annualFamilyIncome, purpose, occupation, landStatus, otherInfo

PERSON'S DESCRIPTION:
"""
${text}
"""`;

const extractWithModel = async (text) => {
    const client = getClient();
    if (!client) return null;
    try {
        const call = client.models.generateContent({
            model: MODEL,
            contents: buildExtractionPrompt(text),
            config: { responseMimeType: "application/json", temperature: 0 }
        });
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), MODEL_TIMEOUT_MS));
        const response = await Promise.race([call, timeout]);
        const parsed = JSON.parse(String(response.text || "").replace(/^```(?:json)?|```$/gim, "").trim());
        return sanitiseModelProfile(parsed);
    } catch (err) {
        return null; // fall back to rules
    }
};

// Main entry. Never throws. source: "ai+rules" | "rules"
const extractProfile = async (text) => {
    const rules = extractProfileByRules(text);
    const modelProfile = await extractWithModel(text);

    let profile = rules;
    let source = "rules";
    if (modelProfile) {
        profile = {};
        for (const key of Object.keys(rules)) {
            profile[key] = modelProfile[key] !== null ? modelProfile[key] : rules[key];
        }
        source = "ai+rules";
    }

    return { profile, missingInformation: buildMissing(profile), source };
};

module.exports = { extractProfile, extractProfileByRules, sanitiseModelProfile };