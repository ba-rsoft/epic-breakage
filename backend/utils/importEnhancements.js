const axios = require("axios");
require("dotenv").config();
 
const JIRA_BASE_URL = process.env.JIRA_BASE_URL;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
 
if (!JIRA_API_TOKEN) {
    throw new Error("❌ JIRA_API_TOKEN is missing. Please check your .env file.");
}
 
/**
 * Link an Enhancement to a Parent, with optional Jira config.
 */
async function linkEnhancementToParent(enhancementKey, parentKey, jiraConfig = {}) {
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
    const baseUrl = jiraConfig.baseUrl || JIRA_BASE_URL;
    const email = jiraConfig.email || JIRA_EMAIL;
    const token = jiraConfig.token || JIRA_API_TOKEN;
    await axios.post(`${baseUrl}/rest/api/2/issueLink`, linkPayload, {
      auth: { username: email, password: token },
      headers: { "Accept": "application/json", "Content-Type": "application/json" }
    });
    console.log(`? Linked Enhancement ${enhancementKey} to Parent ${parentKey}`);
  } catch (error) {
    console.error("? Failed to link enhancement:", error.response?.data || error.message);
  }
}
 
/**
 * Link a Story to a Parent in RSOFTBMS (using 'Relates' link type)
 */
async function linkStoryToParent(storyKey, parentKey) {
  try {
    if (!parentKey) {
      console.warn(`No valid parent key provided to link story ${storyKey}`);
      return;
    }
    const linkPayload = {
      type: { name: "Relates" },
      inwardIssue: { key: storyKey },
      outwardIssue: { key: parentKey }
    };
    await axios.post(`${process.env.JIRA_URL_BMS}/rest/api/2/issueLink`, linkPayload, {
      auth: { username: process.env.JIRA_EMAIL_BMS, password: process.env.JIRA_API_TOKEN_BMS },
      headers: { "Accept": "application/json", "Content-Type": "application/json" }
    });
    console.log(`🔗 Linked Story ${storyKey} to Parent ${parentKey} in RSOFTBMS`);
  } catch (error) {
    console.error("🔗 Failed to link story:", error.response?.data || error.message);
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
            console.log(`📝 Creating Enhancement: ${enhancement.summary || enhancement.user_story_summary} under project ${projectKey}`);
            if (projectKey === "RSOFTBMS") {
                // Determine the parent epic key for linking
                const parentKey = enhancement.ticket_id
                  ? enhancement.ticket_id.trim()
                  : enhancement.jiraTicket
                    ? enhancement.jiraTicket.trim()
                    : "";
                // Define epicKey from enhancement.epic_key or fallback to parentKey if needed
                const epicKey = enhancement.epic_key ? enhancement.epic_key.trim() : parentKey;
                // Add debug logs for parentKey and epicKey
                console.log(`[BMS] parentKey: '${parentKey}', epicKey: '${epicKey}' for story import`);
                // Create Story payload for RSOFTBMS
                const payload = {
                    fields: {
                        project: { key: projectKey },
                        summary: enhancement.summary && enhancement.summary.trim().length > 0 ? enhancement.summary.trim() : "No summary provided",
                        customfield_10129: {
                            type: "doc",
                            version: 1,
                            content: [{
                                type: "paragraph",
                                content: [{
                                    type: "text",
                                    text: enhancement.user_story_summary && enhancement.user_story_summary.trim().length > 0 ? enhancement.user_story_summary.trim() : "No user story summary provided"
                                }]
                            }]
                        },
                        description: enhancement.description
                            ? { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: enhancement.description }] }] }
                            : { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: "No description provided" }] }] },
                        issuetype: { name: 'Story' },
                        customfield_10127: enhancement.check_points
                            ? { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: enhancement.check_points }] }] }
                            : { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: "No Check Points" }] }] },
                        customfield_10128: enhancement.validations
                            ? { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: enhancement.validations }] }] }
                            : { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: "No Validations" }] }] }
                        // Do NOT include customfield_10174 for Stories (handled by linkStoryToParent)
                    }
                };
                // console.log("BMS Story Payload:", JSON.stringify(payload, null, 2));
                try {
                    const response = await axios.post(`${process.env.JIRA_URL_BMS}/rest/api/3/issue`, payload, {
                        auth: { username: process.env.JIRA_EMAIL_BMS, password: process.env.JIRA_API_TOKEN_BMS },
                        headers: {
                            "Content-Type": "application/json",
                            "Accept": "application/json"
                        }
                    });
                    const storyKey = response.data.key;
                    console.log(`✅ Story Created: ${storyKey}`);
                    createdEnhancementKeys.push(storyKey);
                    // Log the ticket id (storyKey) after creation
                    console.log(`[BMS] Imported Story Ticket ID: ${storyKey}`);
                    // Link the story to its parent epic using "Relates" link if epicKey is present
                    if (parentKey) {
                        console.log(`[BMS] Linking story '${storyKey}' to parent '${parentKey}' using linkStoryToParent`);
                        await linkStoryToParent(storyKey, parentKey);
                    } else if (epicKey) {
                        console.log(`[BMS] Linking story '${storyKey}' to epic '${epicKey}' using linkStoryToParent`);
                        await linkStoryToParent(storyKey, epicKey);
                    } else {
                        console.warn(`[BMS] No valid parent key found for story ${storyKey}. parentKey: '${parentKey}', epicKey: '${epicKey}'`);
                    }
                    // Add a comment with success message and ticket id
                    const commentBody = {
                        body: {
                            type: "doc",
                            version: 1,
                            content: [{
                                type: "paragraph",
                                content: [{
                                    type: "text",
                                    text: `Story created successfully from AI generation at ${new Date().toLocaleString()}\nJira Ticket ID: ${storyKey}`
                                }]
                            }]
                        }
                    };
                    await axios.post(
                        `${process.env.JIRA_URL_BMS}/rest/api/3/issue/${storyKey}/comment`,
                        commentBody,
                        {
                            auth: { username: process.env.JIRA_EMAIL_BMS, password: process.env.JIRA_API_TOKEN_BMS },
                            headers: { "Content-Type": "application/json" }
                        }
                    );
                } catch (error) {
                    console.error("❌ JIRA API Error Response:", error.response ? error.response.data : error.message);
                }
            } else {
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
                        customfield_10040: {
                            type: "doc",
                            version: 1,
                            content: [{
                                type: "paragraph",
                                content: [{ type: "text", text: enhancement.i_want }]
                            }]
                        },
                        customfield_10041: {
                            type: "doc",
                            version: 1,
                            content: [{
                                type: "paragraph",
                                content: [{ type: "text", text: enhancement.so_that }]
                            }]
                        },
                        customfield_10059: {
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
            }
        } catch (error) {
            console.error(`❌ Error importing Enhancement/Story: ${enhancement.summary || enhancement.user_story_summary}`,
                error.response?.data || error.message);
        }
    }
 
    console.log("✅ All Created Enhancement/Story Keys:", createdEnhancementKeys);
    return createdEnhancementKeys;
}
 
module.exports = { importEnhancements, linkEnhancementToParent, linkStoryToParent };