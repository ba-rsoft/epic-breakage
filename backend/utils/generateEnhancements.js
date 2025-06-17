const fs = require('fs');
require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
 
// Load API Credentials
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
 
/**
 * Generates enhancement details using Gemini AI.
 *
 * @param {string} description - The functional requirement description
 * @param {string} i_want - I want for the enhancement
 * @param {string} so_that - So that for the enhancement
 * @param {string} acceptance_criteria - Acceptance criteria for the enhancement
 * @param {string|null} customPrompt - Optional custom prompt from UI
 */
async function generateEnhancements({ ticketId, description, i_want, so_that, acceptance_criteria }, customPrompt = '') {
    try {
        const promptPath = 'prompt.txt';
        if (!fs.existsSync(promptPath)) {
            console.error("❌ 'prompt.txt' file is missing.");
            return [{ error: "'prompt.txt' file is missing." }];
        }
       
        let prompt = fs.readFileSync(promptPath, 'utf8');
        prompt = prompt.replace("{{ticketId}}", ticketId)
                       .replace("{{description}}", description || "No description provided")
                       .replace("{{i_want}}", i_want || "No requirement specified")
                       .replace("{{so_that}}", so_that || "No purpose specified")
                       .replace("{{acceptance_criteria}}", acceptance_criteria || "No acceptance criteria specified")
                       .replace("{{customPrompt}}", customPrompt || " ")
 
        console.log("🟡 Final Combined Prompt:\n", prompt);
 
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
 
        console.log("🔄 Sending Enhancement to Gemini AI...");
        const result = await model.generateContent(prompt);
        const response =  result.response;
 
        if (!response || typeof response.text !== "function") {
            console.error("❌ AI Response is empty or invalid.");
            console.log("Raw AI Response:", response);
            return [{ error: "AI response is empty or invalid." }];
        }        const rawText = response.text();
        console.log("🟢 Raw Gemini Output BEFORE Parsing:\n", rawText);
 
        const enhancements = parseEnhancements(rawText);
 
        if (enhancements.length === 0) {
            console.warn("⚠️ No valid enhancements found in AI response. Returning raw response for debugging.");
            return [{ error: "No valid enhancements found in AI response.", rawResponse: rawText }];
        }
 
        return enhancements;
 
    } catch (error) {
        console.error("❌ Error in function generating enhancements:", error.message);
        return [{ error: error.message }];
    }
}
 
 
/**
 * Parses AI response into structured enhancements based on the provided JSON schema.
 */
function parseEnhancements(rawText) {
    try {
        // Clean the response string: remove markdown/code block wrappers
        const cleanedText = rawText
          .replace(/```(json)?/g, "") // remove ``` or ```json
          .trim();
 
        const parsedResponse = JSON.parse(cleanedText);
 
        if (!parsedResponse.enhancements || !Array.isArray(parsedResponse.enhancements)) {
            console.error("❌ AI response does not contain 'enhancements' array.");
            return [];
        }
 
        // console.log("✅ Parsed Enhancements:", JSON.stringify(parsedResponse.enhancements, null, 2));
        return parsedResponse.enhancements;
    } catch (error) {
        console.error("❌ Error parsing AI response as JSON:", error.message);
        return [];
    }
}

module.exports = { generateEnhancements };