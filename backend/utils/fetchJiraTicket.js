require('dotenv').config();
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");
 
// Initialize genAI with the API key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
 
// Load credentials from .env file
const JIRA_BASE_URL = process.env.JIRA_BASE_URL;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
/**
 * Recursively extracts text and tables from ADF content.
 * This function returns a plain text string and any tables found.
 * @param {Array} contentArray - The array containing rich text content.
 * @returns {Object} - { text: string, tables: Array }
 */
function extractContent(contentArray) {
    let extractedText = "";
    let tables = [];
 
    if (!Array.isArray(contentArray)) {
        return { text: "No content available.", tables };
    }
 
    for (const block of contentArray) {
        if (block.type === "paragraph" && block.content) {
            extractedText += extractContent(block.content).text + " ";
        }
        if (block.type === "text" && block.text) {
            extractedText += block.text + " ";
        }
        if (block.type === "table") {
            let tableData = block.content.map(row =>
                row.content.map(cell => extractContent(cell.content).text.trim())
            );
            tables.push(tableData);
        }
    }
 
    return { text: extractedText.trim(), tables };
}
 
/**
 * Recursively formats ADF content preserving formatting.
 * This function converts content to a Markdown-like formatted string,
 * handling paragraphs, headings, bullet/ordered lists, and tables.
 * @param {Array} contentArray - The array containing rich text content.
 * @param {number} indent - The current indentation level.
 * @returns {string} - The formatted string.
 */
function formatADFContent(contentArray, indent = 0) {
    let result = "";
    if (!Array.isArray(contentArray)) return "";
    const indentStr = " ".repeat(indent);
    for (const block of contentArray) {
        switch (block.type) {
            case "paragraph":
                result += indentStr + formatADFContent(block.content, indent) + "\n\n";
                break;
            case "text":
                result += block.text;
                break;
            case "heading":
                // Use block.attrs.level if available (default to level 1)
                const level = (block.attrs && block.attrs.level) || 1;
                result += "\n" + "#".repeat(level) + " " + formatADFContent(block.content, indent) + "\n\n";
                break;
            case "bulletList":
                for (const item of block.content) {
                    result += indentStr + "- " + formatADFContent(item.content, indent + 2) + "\n";
                }
                result += "\n";
                break;
            case "orderedList":
                let counter = 1;
                for (const item of block.content) {
                    result += indentStr + `${counter}. ` + formatADFContent(item.content, indent + 2) + "\n";
                    counter++;
                }
                result += "\n";
                break;
            case "listItem":
                result += formatADFContent(block.content, indent);
                break;
            case "table":
                // Format table in Markdown style
                let tableData = block.content.map(row =>
                    row.content.map(cell => formatADFContent(cell.content, indent).trim())
                );
                if (tableData.length > 0) {
                    // Assume first row is header
                    let header = tableData[0];
                    result += "\n" + indentStr + "| " + header.join(" | ") + " |\n";
                    result += indentStr + "| " + header.map(() => "---").join(" | ") + " |\n";
                    for (let i = 1; i < tableData.length; i++) {
                        result += indentStr + "| " + tableData[i].join(" | ") + " |\n";
                    }
                    result += "\n";
                }
                break;
            default:
                if (block.content) {
                    result += formatADFContent(block.content, indent);
                }
                break;
        }
    }
    return result.trim();
}
 
/**
 * Fetches a JIRA Epic ticket and extracts details.
 * @param {string} ticketId - The JIRA ticket ID to fetch.
 * @returns {Object} - Extracted JIRA details.
 */
async function fetchJiraTicket(ticketId) {
    try {
        const response = await axios.get(`${JIRA_BASE_URL}/rest/api/3/issue/${ticketId}`, {
            auth: {
                username: JIRA_EMAIL,
                password: JIRA_API_TOKEN
            },
            headers: { "Accept": "application/json" }
        });
 
        const issue = response.data;
 
        // Extract Description
        const descriptionData = issue.fields.description && issue.fields.description.content
            ? extractContent(issue.fields.description.content)
            : { text: "No Description available.", tables: [] };
               
        // Extract "I Want" field with formatting
        const iWantFormatted = issue.fields.customfield_10040 && issue.fields.customfield_10040.content
            ? formatADFContent(issue.fields.customfield_10040.content)
            : "No 'I Want' data found.";
 
        // Extract "So That" Field with plain extraction
        const soThatData = issue.fields.customfield_10041 && issue.fields.customfield_10041.content
            ? extractContent(issue.fields.customfield_10041.content)
            : { text: "No 'So That' data found.", tables: [] };
       
        // Fetch images from JIRA attachments
        const images = issue.fields.attachment ? issue.fields.attachment.map(att => att.content) : [];
             return {
            ticketId: issue.key,
            description: descriptionData.text,
            i_want: iWantFormatted,
            so_that: soThatData.text
        };
    } catch (error) {
       return {
            error: error.response ? JSON.stringify(error.response.data, null, 2) : error.message
};    
        }
}
 
// Export the function for use in other files
module.exports = { fetchJiraTicket };