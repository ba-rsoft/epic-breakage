const axios = require("axios");
require("dotenv").config();
 
const JIRA_BASE_URL = process.env.JIRA_BASE_URL;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
 
if (!JIRA_API_TOKEN) {
    throw new Error("❌ JIRA_API_TOKEN is missing. Please check your .env file.");
}
 
/**
 * Link an Enhancement to a Parent.
 */
async function linkEnhancementToParent(enhancementKey, parentKey) {
  try {
    if (!parentKey) {
      console.warn(`No valid parent key provided to link enhancement ${enhancementKey}`);
      return;
    }
    const linkPayload = {
      type: { name: "Relates" },
      inwardIssue: { key: enhancementKey },
      outwardIssue: { key: parentKey }
    };
    await axios.post(`${JIRA_BASE_URL}/rest/api/2/issueLink`, linkPayload, {
      auth: { username: JIRA_EMAIL, password: JIRA_API_TOKEN },
      headers: { "Accept": "application/json", "Content-Type": "application/json" }
    });
    console.log(`? Linked Enhancement ${enhancementKey} to Parent ${parentKey}`);
  } catch (error) {
    console.error("? Failed to link enhancement:", error.response?.data || error.message);
  }
}
 
/**
 * Import enhancements into JIRA using the provided project key.
 * @param {Array} enhancements - Array of enhancement objects from AI generation
 * @param {string} projectKey - The JIRA project key
 * @returns {Array} Created enhancement ticket keys
 */
async function importEnhancements(enhancements, projectKey) {
    const createdEnhancementKeys = [];
 
    for (const enhancement of enhancements) {
        try {
            console.log(`📝 Creating Enhancement: ${enhancement.summary} under project ${projectKey}`);
           
            // Create enhancement payload with proper ADF formatting
            const payload = {
                fields: {
                    project: { key: projectKey },
                    summary: enhancement.summary,
                    description: {
                        type: "doc",
                        version: 1,
                        content: [{
                            type: "paragraph",
                            content: [{ type: "text", text: enhancement.description }]
                        }]
                    },
                    issuetype: { name: 'Enhancement' },
                    customfield_10040: { // I Want field
                        type: "doc",
                        version: 1,
                        content: [{
                            type: "paragraph",
                            content: [{ type: "text", text: enhancement.i_want }]
                        }]
                    },
                    customfield_10041: { // So That field
                        type: "doc",
                        version: 1,
                        content: [{
                            type: "paragraph",
                            content: [{ type: "text", text: enhancement.so_that }]
                        }]
                    },
                    customfield_10059: { // Acceptance Criteria field
                        type: "doc",
                        version: 1,
                        content: [{
                            type: "paragraph",
                            content: [{ type: "text", text: enhancement.acceptance_criteria }]
                        }]
                    }
                }
            };
 
            const response = await axios.post(`${JIRA_BASE_URL}/rest/api/3/issue`, payload, {
                auth: { username: JIRA_EMAIL, password: JIRA_API_TOKEN },
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                }
            });
 
            const enhancementKey = response.data.key;
            console.log(`✅ Enhancement Created: ${enhancementKey}`);
            createdEnhancementKeys.push(enhancementKey);
            //Determine the parent key for linking: use parentTicket if present; otherwise, use jiraTicket.
            const parentKey = enhancement.ticket_id
              ? enhancement.ticket_id.trim()
              : enhancement.jiraTicket
                ? enhancement.jiraTicket.trim()
                : "";
            console.log(`? Parent Key for Linking: ${parentKey}`);
               
            if (parentKey) {
              await linkEnhancementToParent(enhancementKey, parentKey);
            } else {
              console.warn(`No valid parent key found for enhancement ${enhancementKey}`);
            }
 
            // Add a comment with success message
            const commentBody = {
                body: {
                    type: "doc",
                    version: 1,
                    content: [{
                        type: "paragraph",
                        content: [{
                            type: "text",
                            text: `Enhancement created successfully from AI generation at ${new Date().toLocaleString()}`
                        }]
                    }]
                }
            };
 
            await axios.post(
                `${JIRA_BASE_URL}/rest/api/3/issue/${enhancementKey}/comment`,
                commentBody,
                {
                    auth: { username: JIRA_EMAIL, password: JIRA_API_TOKEN },
                    headers: { "Content-Type": "application/json" }
                }
            );
 
        } catch (error) {
            console.error(`❌ Error importing Enhancement: ${enhancement.summary}`,
                error.response?.data || error.message);
        }
    }
 
    console.log("✅ All Created Enhancement Keys:", createdEnhancementKeys);
    return createdEnhancementKeys;
}
 
module.exports = { importEnhancements, linkEnhancementToParent };