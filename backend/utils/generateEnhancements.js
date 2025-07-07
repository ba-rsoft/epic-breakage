const fs = require('fs');
require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
 
// Load API Credentials
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
 
/**
 * Generates enhancement details using Gemini AI.
 *
 * For RSOFTBMS, generates story details (User Story Summary, Check Points, Description, Validations).
 * For RSOFT, generates enhancement details (existing logic).
 *
 * @param {object} params - The input fields (fields differ for RSOFT and RSOFTBMS)
 * @param {string|null} customPrompt - Optional custom prompt from UI
 */
async function generateEnhancements(params, customPrompt = '') {
    try {
        // Use promptbms.txt for RSOFTBMS, prompt.txt for RSOFT
        const promptPath = params.projectKey === 'RSOFTBMS' ? 'promptbms.txt' : 'prompt.txt';
        if (!fs.existsSync(promptPath)) {
            console.error(`❌ '${promptPath}' file is missing.`);
            return [{ error: `'${promptPath}' file is missing.` }];
        }

        let prompt = fs.readFileSync(promptPath, 'utf8');
        // Detect if this is for RSOFTBMS (story) or RSOFT (enhancement)
        const isBMS = params.projectKey === 'RSOFTBMS';
        if (isBMS) {
            // Replace BMS fields in prompt
            prompt = prompt.replace("{{ticketId}}", params.ticketId)
                .replace("{{user_story_summary}}", params.user_story_summary || "No User Story Summary")
                .replace("{{check_points}}", params.check_points || "No Check Points")
                .replace("{{description}}", params.description || "No description provided")
                .replace("{{validations}}", params.validations || "No Validations");
            // Append customPrompt and instructions at the end (same as RSOFT logic)
            prompt = prompt.replace("{{customPrompt}}", customPrompt || " ") +
                "\n\nIMPORTANT: Respond ONLY with a single JSON object with a top-level 'stories' array, e.g. {\"stories\": [...]}. Do NOT include markdown, code blocks, explanations, or any other text. Output ONLY valid JSON. If you cannot generate stories, return {\"stories\": []}. Example: {\"stories\": [{...}]}\n";
        } else {
            // RSOFT enhancement (existing logic)
            prompt = prompt.replace("{{ticketId}}", params.ticketId)
                .replace("{{description}}", params.description || "No description provided")
                .replace("{{i_want}}", params.i_want || "No requirement specified")
                .replace("{{so_that}}", params.so_that || "No purpose specified")
                .replace("{{acceptance_criteria}}", params.acceptance_criteria || "No acceptance criteria specified")
                .replace("{{customPrompt}}", customPrompt || " ");
        }

        console.log("🟡 Final Combined Prompt:\n", prompt);

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        console.log("🔄 Sending Enhancement/Story to Gemini AI...");
        const result = await model.generateContent(prompt);
        const response =  result.response;

        if (!response || typeof response.text !== "function") {
            console.error("❌ AI Response is empty or invalid.");
            console.log("Raw AI Response:", response);
            return [{ error: "AI response is empty or invalid." }];
        }
        const rawText = response.text();
        console.log("🟢 Raw Gemini Output BEFORE Parsing:\n", rawText);

        // For BMS, parse as stories; for RSOFT, parse as enhancements
        const enhancementsOrStories = isBMS ? parseStories(rawText) : parseEnhancements(rawText);

        if (enhancementsOrStories.length === 0) {
            console.warn(`⚠️ No valid ${isBMS ? 'stories' : 'enhancements'} found in AI response. Returning raw response for debugging.`);
            // Log the rawText for debugging
            console.log('AI response rawText:', rawText);
            return [{ error: `No valid ${isBMS ? 'stories' : 'enhancements'} found in AI response.`, rawResponse: rawText }];
        }

        return enhancementsOrStories;

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

/**
 * Parses AI response into structured stories for RSOFTBMS based on the provided JSON schema.
 */
function parseStories(rawText) {
    try {
        // Clean the response string: remove markdown/code block wrappers
        let cleanedText = rawText
            .replace(/```(json)?/g, "") // remove ``` or ```json
            .replace(/^[^\{\[]+/, "") // remove any leading text before JSON
            .replace(/\n/g, " ") // flatten newlines
            .trim();
        // Try to extract the first valid JSON object/array from the response
        const firstBrace = cleanedText.indexOf('{');
        const lastBrace = cleanedText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            cleanedText = cleanedText.substring(firstBrace, lastBrace + 1);
        }
        // Try parsing as JSON
        let parsedResponse;
        try {
            parsedResponse = JSON.parse(cleanedText);
        } catch (e) {
            // Try to recover if the AI returned an array directly
            if (cleanedText.startsWith('[') && cleanedText.endsWith(']')) {
                parsedResponse = { stories: JSON.parse(cleanedText) };
            } else {
                // Try to extract JSON from within the string
                const match = cleanedText.match(/\{\s*\"stories\"\s*:\s*\[/);
                if (match) {
                    const start = cleanedText.indexOf('{', match.index);
                    const end = cleanedText.lastIndexOf('}');
                    if (start !== -1 && end !== -1 && end > start) {
                        parsedResponse = JSON.parse(cleanedText.substring(start, end + 1));
                    } else {
                        throw e;
                    }
                } else {
                    // Fallback: try to wrap a single object as an array
                    try {
                        const singleObj = JSON.parse(cleanedText);
                        if (singleObj && typeof singleObj === 'object' && !Array.isArray(singleObj)) {
                            parsedResponse = { stories: [singleObj] };
                        } else {
                            throw e;
                        }
                    } catch (fallbackErr) {
                        throw e;
                    }
                }
            }
        }
        // Accept both { stories: [...] } and [...]
        if (Array.isArray(parsedResponse)) {
            return parsedResponse;
        }
        if (parsedResponse && Array.isArray(parsedResponse.stories)) {
            return parsedResponse.stories;
        }
        console.error("❌ AI response does not contain 'stories' array. Raw:", cleanedText);
        return [];
    } catch (error) {
        console.error("❌ Error parsing AI response as JSON (stories):", error.message, "Raw:", rawText);
        return [];
    }
}

module.exports = { generateEnhancements };