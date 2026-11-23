require("dotenv").config();

const { GoogleGenAI } = require("@google/genai");

async function testGemini() {
  try {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is missing from .env");
    }

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: "Reply with exactly: Gemini integration working",
    });

    console.log("\n===== GEMINI TEST =====");
    console.log(response.text);
    console.log("=======================\n");
  } catch (error) {
    console.error("\n===== GEMINI TEST FAILED =====");
    console.error(error.message);
    console.error("==============================\n");
  }
}

testGemini();