const { GoogleGenAI } = require("@google/genai");

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing from .env");
}

const ai = new GoogleGenAI({
    apiKey
});

const generateSchemeMatches = async (userMessage, schemes) => {
    const schemeData = schemes.map((scheme) => ({
        name: scheme.name,
        category: scheme.category,
        description: scheme.description,
        eligibility: scheme.eligibility,
        benefits: scheme.benefits,
        requiredDocuments: scheme.requiredDocuments,
        applicationSteps: scheme.applicationSteps,
        officialSource: scheme.officialSource,
        deadline: scheme.deadline,
        lastVerified: scheme.lastVerified,
        verificationStatus: scheme.verificationStatus
    }));

    const prompt = `
You are an AI assistant for a government scheme discovery application.

The user describes their situation in plain language.

Your job is to identify which of the provided schemes may be relevant.

IMPORTANT RULES:
- Say "likely eligible" or "possibly eligible", never "guaranteed eligible".
- Use ONLY the scheme data provided below.
- Do not invent eligibility rules.
- Explain which eligibility rule supports each match.
- If required information is missing, clearly say what is missing.
- Do not ask for Aadhaar number or other sensitive ID numbers.
- Provide relevant documents and application steps from the supplied scheme data.
- Include the official source.
- If no scheme matches, say so clearly.

USER SITUATION:
${userMessage}

AVAILABLE SCHEMES:
${JSON.stringify(schemeData, null, 2)}

Return a concise response with:
1. Likely matching schemes
2. Why each scheme may match
3. Missing information, if any
4. Required documents
5. Application steps
6. Official source
`;

    const response = await ai.models.generateContent({
        model: "gemini-3.5-flash-lite",
        contents: prompt
    });

    return response.text;
};

module.exports = {
    generateSchemeMatches
};