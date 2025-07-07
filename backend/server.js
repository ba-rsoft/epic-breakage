require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const socketIo = require("socket.io");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { fetchJiraTicket } = require("./utils/fetchJiraTicket");
const { generateEnhancements } = require("./utils/generateEnhancements");
const { importEnhancements } = require("./utils/importEnhancements");
const mcpService = require("./services/mcpService");
 
const app = express();
const server = http.createServer(app);
 
// Initialize MCP Service
let mcpInitialized = false;
console.log('🚀 Starting server initialization...');
 
mcpService.on('connected', () => {
    console.log('🌟 MCP connection established successfully');
    console.log('📊 MCP Status: Connected and Ready');
    mcpInitialized = true;
    io.emit('mcpStatus', { connected: true });
});
 
mcpService.on('message', (data) => {
    console.log('📨 Received MCP message:', JSON.stringify(data, null, 2));
    console.log('⏱️ Timestamp:', new Date().toISOString());
    io.emit('mcpMessage', data);
});
 
mcpService.on('fallback', (error) => {
    console.log('⚠️ MCP Service Fallback Activated');
    console.error('❌ Error details:', error);
    console.log('📊 Current Status: Switching to REST API mode');
    mcpInitialized = false;
    io.emit('mcpStatus', { connected: false, error: error?.message });
});
 
// Attempt MCP connection
console.log('🔄 Initiating MCP connection...');
mcpService.connectBoth().then(() => {
    console.log('🌟 Both MCP connections established successfully');
    mcpInitialized = true;
    io.emit('mcpStatus', { connected: true });
}).catch(error => {
    console.error('❌ Initial MCP connection(s) failed');
    console.error('🔍 Error details:', error);
    console.log('⚡ Starting in REST API mode');
    mcpInitialized = false;
});
const io = socketIo(server, {
     cors: {
     origin: "http://localhost:3000", // Your frontend origin
      methods: ["GET", "POST"],
      credentials: true
     }
 });
 
const PORT = process.env.PORT || 5000;
const JIRA_BASE_URL = process.env.JIRA_BASE_URL;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
 
if (!JIRA_API_TOKEN) {
  throw new Error("? JIRA_API_TOKEN is missing. Please check your .env file.");
}
 
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
 
app.use(cors());
 
// Global in-memory store for enhancements(ticketId as key)
let storedEnhancements = {};
let lastAssigneeValue = {};
let lastIWantValue = {};
 
const { diagnoseConnection } = require('./utils/mcpDiagnostic');
const { getMcpServerUrl } = require('./services/mcpService');
 
app.get("/", (req, res) => {
  res.send("✅ Express Server is Running!");
});
 
app.get("/api/diagnose-mcp", async (req, res) => {
    try {
        const diagnosis = await diagnoseConnection();
        res.json({
            status: 'completed',
            results: diagnosis
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});
 
// Webhook endpoint to handle JIRA updates
app.post("/webhook", async (req, res) => {
  try {
    console.log("Webhook received at /webhook endpoint");
    console.log("Request body:", JSON.stringify(req.body, null, 2));
    const { issue, changelog } = req.body;
    const ticketId = issue.key;
    let projectKey = issue.fields.project?.key || "";
    projectKey = projectKey.toUpperCase(); // Normalize to uppercase
    console.log(`Parsed ticketId: ${ticketId}, projectKey: ${projectKey}`);
    // Log which MCP server URL will be used
    const mcpUrl = getMcpServerUrl(projectKey);
    console.log(`MCP server URL for this project: ${mcpUrl}`);
    // Dynamically connect to the correct MCP server for this project
    try {
      await mcpService.connect(mcpUrl); // Pass projectKey so mcpService can use the right URL
      console.log(`Connected to MCP server for project: ${projectKey}`);
    } catch (err) {
      console.error(`Failed to connect to MCP server for project ${projectKey}:`, err.message);
    }
 
    // RSOFT logic (existing, unchanged)
    if (projectKey === "RSOFT") {
      // Log the changelog items for debugging
      console.log("Changelog items:", JSON.stringify(changelog.items, null, 2));
 
      // Retrieve the stored value of assignee
      const storedAssignee = lastAssigneeValue[ticketId] || "";
      const assigneeUpdate = changelog.items.find(item => item.field === "assignee");
      const newAssignee = assigneeUpdate?.toString || "";
 
      // Log the old and new values for debugging
      console.log(`Old value of assignee: "${storedAssignee}"`);
      console.log(`New value of assignee: "${newAssignee}"`);
 
      // Extract changelog updates for customfield_10040
      const customField10040Update = changelog.items.find(item => item.fieldId === "customfield_10040");
      const oldField10040 = customField10040Update?.fromString || "";
      const newField10040 = customField10040Update?.toString || "";
 
      // Log the old and new values for customfield_10040
      console.log(`Old value of customfield_10040: "${oldField10040}"`);
      console.log(`New value of customfield_10040: "${newField10040}"`);
 
      // Retrieve the current value of assignee from the issue fields
      const currentAssignee = issue.fields.assignee?.displayName || "";
 
      // Log the current value of assignee
      console.log(`Current value of assignee: "${currentAssignee}"`);
 
      // Compare old and new values for assignee
      if (storedAssignee !== newAssignee) {
        console.log(`Assignee updated. Old: "${storedAssignee}", New: "${newAssignee}".`);
        lastAssigneeValue[ticketId] = newAssignee; // Update the tracker
 
        // Trigger process if assignee is "TeamBA"
        if (newAssignee === "TeamBA") {
          console.log(`Triggering enhancement generation for ticket ${ticketId} due to assignee update...`);
 
          // Proceed with enhancement generation logic
          const jiraData = await fetchJiraTicket(ticketId);
          if (!jiraData || !jiraData.description) {
            console.error(`❌ Could not fetch JIRA ticket data for ${ticketId}`);
            return res.status(404).json({ error: `JIRA ticket ${ticketId} not found or missing description.` });
          }
 
          // Prepare enhancement fields
          const enhancementSummary = jiraData.summary || "No summary provided";
          const enhancementDescription = jiraData.description || "No description provided";
          const enhancementIWant = jiraData.i_want || "No i_want provided";
          const enhancementSoThat = jiraData.so_that || "No so_that provided";
          const enhancementAcceptanceCriteria = jiraData.acceptance_criteria || "No acceptance criteria provided";
 
          // console.log("✅ Enhancement Data:", {
          //   summary: enhancementSummary,
          //   description: enhancementDescription,
          //   i_want: enhancementIWant,
          //   so_that: enhancementSoThat,
          //   acceptance_criteria: enhancementAcceptanceCriteria
          // });
 
          // Generate enhancements
          const enhancements = await generateEnhancements(
            jiraData.description,
            jiraData.i_want,
            jiraData.so_that,
            jiraData.acceptance_criteria,
            "", // customPrompt
            jiraData.acceptanceCriteria,
            jiraData.images
          );
 
          if (enhancements && enhancements.length > 0) {
            const formattedEnhancements = enhancements.map((enhancement, index) => ({
              enhancement_id: enhancement.enhancement_id || `${ticketId}-ENH-${index + 1}`,
              summary: enhancement.summary?.trim() || enhancementSummary,
              description: enhancement.description?.trim() || enhancementDescription,
              i_want: enhancement.i_want || enhancementIWant,
              so_that: enhancement.so_that || enhancementSoThat,
              acceptance_criteria: enhancement.acceptance_criteria || enhancementAcceptanceCriteria,
              jiraTicket: ticketId
            }));
 
            console.log("Enhancement Data:", formattedEnhancements);
 
            storedEnhancements[ticketId] = formattedEnhancements;
            console.log(`Enhancements generated for ${ticketId}`);
          } else {
            console.warn(`No enhancements generated for ${ticketId}`);
          }
 
          const publicUrl = `http://localhost:3000/enhancements/${ticketId}`;
       
          console.log(`Generated URL: ${publicUrl}`);
 
          // Add a comment to the JIRA ticket (without "Committed By" or "Updated" lines)
          const currentISTTime = new Date().toLocaleString("en-GB", {
            timeZone: "Asia/Kolkata",
            hour12: false,
          });
          const formattedTime = currentISTTime.replace(",", "");
 
          const commentBody = `
*✅ __Enhancements Generated Successfully__*
 
*🕒 Time:* *${formattedTime}*  
*📄 Total Enhancements:* *${storedEnhancements[ticketId]?.length || 0}*
 
🔗 [*👉 Click here to View Enhancements*|${publicUrl}]
`;
 
          try {
            const commentResponse = await axios.post(
              `${process.env.JIRA_BASE_URL}/rest/api/2/issue/${ticketId}/comment`,
              { body: commentBody },
              {
                auth: { username: process.env.JIRA_EMAIL, password: process.env.JIRA_API_TOKEN },
                headers: { "Content-Type": "application/json" }
              }
            );
            console.log("Comment added, response status:", commentResponse.status);
          } catch (axiosError) {
            console.error("Error posting comment to JIRA:", axiosError.response ? axiosError.response.data : axiosError.message);
          }
 
          return res.status(200).json({ message: "Enhancement generation completed.", url: publicUrl });
        }
      } else {
        console.log(`No meaningful change in assignee. Old: "${storedAssignee}", New: "${newAssignee}". Ignoring update.`);
      }
 
      // Compare old and new values for customfield_10040
      if (oldField10040 !== newField10040) {
        console.log(`customfield_10040 updated. Old: "${oldField10040}", New: "${newField10040}".`);
        lastIWantValue[ticketId] = newField10040; // Update the tracker
 
        // Check if assignee is "TeamBA"
        if (currentAssignee === "TeamBA") {
          console.log(`Triggering enhancement generation for ticket ${ticketId} due to customfield_10040 update...`);
 
          // Proceed with enhancement generation logic
          const jiraData = await fetchJiraTicket(ticketId);
          if (!jiraData || !jiraData.description) {
            console.error(`❌ Could not fetch JIRA ticket data for ${ticketId}`);
            return res.status(404).json({ error: `JIRA ticket ${ticketId} not found or missing description.` });
          }
 
          const enhancementSummary = jiraData.summary || "No summary provided";
          const enhancementDescription = jiraData.description || "No description provided";
          const enhancementIWant = jiraData.i_want || "No i_want provided";
          const enhancementSoThat = jiraData.so_that || "No so_that provided";
          const enhancementAcceptanceCriteria = jiraData.acceptance_criteria || "No acceptance criteria provided";
 
          console.log("✅ Enhancement Data:", {
            summary: enhancementSummary,
            description: enhancementDescription,
            i_want: enhancementIWant,
            so_that: enhancementSoThat,
            acceptance_criteria: enhancementAcceptanceCriteria
          });
 
          const enhancements = await generateEnhancements(
            jiraData.description,
            jiraData.i_want,
            jiraData.so_that,
            jiraData.acceptance_criteria,
            "", // customPrompt
          );
 
          if (enhancements && enhancements.length > 0) {
            const formattedEnhancements = enhancements.map((enhancement, index) => ({
              enhancement_id: enhancement.enhancement_id || `${ticketId}-ENH-${index + 1}`,
              summary: enhancement.summary?.trim() || enhancementSummary,
              description: enhancement.description?.trim() || enhancementDescription,
              i_want: enhancement.i_want || enhancementIWant,
              so_that: enhancement.so_that || enhancementSoThat,
              acceptance_criteria: enhancement.acceptance_criteria || enhancementAcceptanceCriteria,
              jiraTicket: ticketId
            }));
 
            console.log("Enhancement Data:", formattedEnhancements);
 
            storedEnhancements[ticketId] = formattedEnhancements;
          } else {
            console.warn(`No enhancements generated for ${ticketId}`);
          }
 
          const publicUrl = `${process.env.TestGenURL_Live}/enhancements/${ticketId}`;
 
          console.log(`Generated URL after Update: ${publicUrl}`);
 
          // Add a comment to the JIRA ticket (without "Updated" line)
          const currentISTTime = new Date().toLocaleString("en-GB", {
            timeZone: "Asia/Kolkata",
            hour12: false,
          });
          const formattedTime = currentISTTime.replace(",", "");
 
          const commentBody = `
*✅ __Enhancements Generated Successfully__*
 
*🕒 Time:* *${formattedTime}*  
*📄 Total Enhancements:* *${storedEnhancements[ticketId]?.length || 0}*
 
🔗 [*👉 Click here to View Enhancements*|${publicUrl}]
`;
 
          try {
            const commentResponse = await axios.post(
              `${process.env.JIRA_BASE_URL}/rest/api/2/issue/${ticketId}/comment`,
              { body: commentBody },
              {
                auth: { username: process.env.JIRA_EMAIL, password: process.env.JIRA_API_TOKEN },
                headers: { "Content-Type": "application/json" }
              }
            );
            console.log("Comment added, response status:", commentResponse.status);
          } catch (axiosError) {
            console.error("Error posting comment to JIRA:", axiosError.response ? axiosError.response.data : axiosError.message);
          }
 
          return res.status(200).json({ message: "Enhancement generation completed.", url: publicUrl });
        } else {
          console.log(`customfield_10040 updated, but assignee is not "TeamBA". Ignoring update.`);
        }
      }
 
      // If no meaningful changes are detected
      console.log(`No meaningful changes detected for ticket ${ticketId}. Ignoring update.`);
      return res.status(200).send("No relevant updates.");
    }
 
    // RSOFTBMS logic: trigger on Team Analyst assignee
    if (projectKey === "RSOFTBMS") {
      // Log for debugging
      console.log("[RSOFTBMS] Webhook logic triggered");
      // Check for assignee update to Team Analyst
      const assigneeUpdate = changelog.items.find(item => item.field === "assignee");
      const newAssignee = assigneeUpdate?.toString || "";
      const storedAssignee = lastAssigneeValue[ticketId] || "";
      const currentAssignee = issue.fields.assignee?.displayName || "";
      if (storedAssignee !== newAssignee) {
        lastAssigneeValue[ticketId] = newAssignee;
        if (newAssignee === "Team Analyst") {
          console.log(`Triggering story generation for BMS ticket ${ticketId} due to assignee update...`);
          // Fetch epic data for BMS
          const jiraData = await fetchJiraTicket(ticketId, "RSOFTBMS");
          if (!jiraData || !jiraData.description) {
            console.error(`❌ Could not fetch JIRA ticket data for ${ticketId}`);
            return res.status(404).json({ error: `JIRA ticket ${ticketId} not found or missing description.` });
          }
          // Prepare story fields
          const storySummary = jiraData.user_story_summary || "No User Story Summary";
          const storyDescription = jiraData.description || "No description provided";
          const storyCheckPoints = jiraData.check_points || "No Check Points";
          const storyValidations = jiraData.validations || "No Validations";
          // Generate story (reuse generateEnhancements for now, or create a new function if needed)
          const stories = await generateEnhancements({
            ticketId,
            user_story_summary: storySummary,
            check_points: storyCheckPoints,
            description: storyDescription,
            validations: storyValidations,
            projectKey: "RSOFTBMS"
          }, "");
          if (stories && stories.length > 0) {
            console.log("[BMS] Stories generated:", JSON.stringify(stories, null, 2));
            const formattedStories = stories.map((story, index) => ({
              story_id: story.story_id || `${ticketId}-STORY-${index + 1}`,
              summary: story.summary?.trim() || storySummary,
              user_story_summary: story.user_story_summary?.trim() || storySummary,
              check_points: story.check_points || storyCheckPoints,
              description: story.description?.trim() || storyDescription,
              validations: story.validations || storyValidations,
              ticket_id: ticketId // Ensure parentKey is set for linking
            }));
            console.log("[BMS] Formatted stories:", JSON.stringify(formattedStories, null, 2));
            storedEnhancements[ticketId] = formattedStories;
            console.log("[BMS] Stored enhancements:", JSON.stringify(storedEnhancements[ticketId], null, 2));
            // Use correct public URL for BMS (always localhost for UI)
            const publicUrl = `http://localhost:3000/stories/${ticketId}`;
            console.log("[BMS] publicUrl:", publicUrl);
            const currentISTTime = new Date().toLocaleString("en-GB", {
              timeZone: "Asia/Kolkata",
              hour12: false,
            });
            console.log("[BMS] currentISTTime:", currentISTTime);
            const formattedTime = currentISTTime.replace(",", "");
            console.log("[BMS] formattedTime:", formattedTime);
            // Add a comment to the JIRA ticket (with 'View Stories')
            // Use Atlassian Document Format (ADF) for comment body
            const adfCommentBody = {
              type: "doc",
              version: 1,
              content: [
                {
                  type: "paragraph",
                  content: [
                    { type: "text", text: "\u2B50 __Stories Created Successfully__\n" },
                    { type: "text", text: `\n\uD83D\uDD52 Time: ${formattedTime}` },
                    { type: "text", text: `\n\uD83D\uDCC4 Total Stories: ${storedEnhancements[ticketId]?.length || 0}` },
                    { type: "text", text: `\n\n\uD83D\uDD17 ` },
                    { type: "text", text: "\uD83D\uDC49 Click here to View Stories", marks: [{ type: "link", attrs: { href: publicUrl } }] }
                  ]
                }
              ]
            };
            // Debug logging for BMS comment
            console.log("[BMS] About to post comment to JIRA (ADF format)");
            console.log("[BMS] Ticket ID:", ticketId);
            const commentApiUrl = `${process.env.JIRA_URL_BMS}/rest/api/3/issue/${ticketId}/comment`;
            console.log("[BMS] Comment API URL:", commentApiUrl);
            console.log("[BMS] JIRA_EMAIL_BMS:", process.env.JIRA_EMAIL_BMS);
            console.log("[BMS] JIRA_API_TOKEN_BMS (first 6 chars):", (process.env.JIRA_API_TOKEN_BMS||'').slice(0,6), '...');
            try {
              const commentResponse = await axios.post(
                commentApiUrl,
                { body: adfCommentBody },
                {
                  auth: { username: process.env.JIRA_EMAIL_BMS, password: process.env.JIRA_API_TOKEN_BMS },
                  headers: { "Content-Type": "application/json" }
                }
              );
              console.log("[BMS] Comment added to BMS, response status:", commentResponse.status);
            } catch (axiosError) {
              console.error("[BMS] Error posting comment to JIRA BMS:", axiosError.response ? axiosError.response.data : axiosError.message);
            }
            console.log("[BMS] Returning response to client with publicUrl:", publicUrl);
            return res.status(200).json({ message: "Story generation completed.", url: publicUrl });
          } else {
            console.warn(`[BMS] No stories generated for ${ticketId}`);
          }
          console.log("[BMS] Returning response to client with publicUrl (no stories):", `${process.env.TestGenURL_Live || 'http://localhost:3000'}/stories/${ticketId}`);
          return res.status(200).json({ message: "Story generation completed.", url: `${process.env.TestGenURL_Live || 'http://localhost:3000'}/stories/${ticketId}` });
        }
      }
    }
    // ...existing code...
    console.log(`No meaningful changes detected for ticket ${ticketId}. Ignoring update.`);
    return res.status(200).send("No relevant updates.");
  } catch (error) {
    console.error("Error handling webhook:", error.message);
    return res.status(500).send("Internal Server Error");
  }
});
 
// POST endpoint to generate enhancements manually
app.post("/api/generate-enhancements", async (req, res) => {
  console.log("🚀 Received request on /api/generate-enhancements");
  const { ticketIds, customPrompts = {}, projectKey } = req.body;
  console.log("📩 Request Body:", req.body);
  try {
      let allEnhancements = [];
      for (const ticketId of ticketIds) {
          console.log(`🔍 Processing ticket ID: ${ticketId}`);
 
          // Detect projectKey for each ticket
          let detectedProjectKey = projectKey;
          if (!detectedProjectKey) {
            detectedProjectKey = ticketId.startsWith("RSOFTBMS-") ? "RSOFTBMS" : "RSOFT";
          }
 
          const jiraData = await fetchJiraTicket(ticketId, detectedProjectKey);
          console.log(`📥 Fetched JIRA Data for ${ticketId}:`, jiraData);
 
          if (!jiraData || !jiraData.description) {
              console.error(`❌ Could not fetch JIRA ticket data or description is missing for ${ticketId}`);
              continue;
          }
 
          if (detectedProjectKey === "RSOFTBMS") {
            // Prepare story fields
            const storySummary = jiraData.user_story_summary || "No User Story Summary";
            const storyDescription = jiraData.description || "No description provided";
            const storyCheckPoints = jiraData.check_points || "No Check Points";
            const storyValidations = jiraData.validations || "No Validations";
            const storySummaryField = jiraData.summary || "No summary provided";
            // Generate stories
            const stories = await generateEnhancements({
              ticketId,
              summary: storySummaryField,
              user_story_summary: storySummary,
              check_points: storyCheckPoints,
              description: storyDescription,
              validations: storyValidations,
              projectKey: "RSOFTBMS"
            }, customPrompts[ticketId] || "");
            if (stories && stories.length > 0) {
              const formattedStories = stories.map((story, index) => ({
                story_id: story.story_id || `${ticketId}-STORY-${index + 1}`,
                summary: story.summary?.trim() || storySummaryField,
                user_story_summary: story.user_story_summary?.trim() || storySummary,
                check_points: story.check_points || storyCheckPoints,
                description: story.description?.trim() || storyDescription,
                validations: story.validations || storyValidations,
                ticket_id: ticketId
              }));
              storedEnhancements[ticketId] = formattedStories;
              allEnhancements = [...allEnhancements, ...formattedStories];
            }
          } else {
            // RSOFT enhancement (existing logic)
            const enhancementSummary = jiraData.summary || "No summary provided";
            const enhancementDescription = jiraData.description || "No description provided";
            const enhancementIWant = jiraData.i_want || "No i_want provided";
            const enhancementSoThat = jiraData.so_that || "No so_that provided";
            const enhancementAcceptanceCriteria = jiraData.acceptance_criteria || "No acceptance criteria provided";
 
            const enhancements = await generateEnhancements({
              ticketId,
              description: jiraData.description,
              i_want: jiraData.i_want,
              so_that: jiraData.so_that,
              acceptance_criteria: jiraData.acceptance_criteria
            }, customPrompts[ticketId] || "");
 
            if (enhancements && enhancements.length > 0) {
              const formattedEnhancements = enhancements.map((enhancement, index) => ({
                enhancement_id: enhancement.enhancement_id || `${ticketId}-ENH-${index + 1}`,
                summary: enhancement.summary?.trim() || enhancementSummary,
                description: enhancement.description?.trim() || enhancementDescription,
                i_want: enhancement.i_want || enhancementIWant,
                so_that: enhancement.so_that || enhancementSoThat,
                acceptance_criteria: enhancement.acceptance_criteria || enhancementAcceptanceCriteria,
                jiraTicket: ticketId
              }));
              storedEnhancements[ticketId] = formattedEnhancements;
              allEnhancements = [...allEnhancements, ...formattedEnhancements];
            }
          }
      }
 
      if (allEnhancements.length === 0) {
          console.error("❌ No enhancements/stories generated for any tickets.");
          return res.status(404).json({ error: "No enhancements/stories generated. Please check the AI response or input data." });
      }
 
      console.log("📦 Final All Enhancements/Stories Sent to Frontend:", JSON.stringify(allEnhancements, null, 2));
      return res.json({ enhancements: allEnhancements });
  } catch (error) {
      console.error("💥 Error generating enhancements/stories:", error);
      return res.status(500).json({ error: "Failed to generate enhancements/stories." });
  }
});
 
// POST endpoint to import enhancements to JIRA
app.post("/api/import-enhancements", async (req, res) => {
  console.log("Received import payload:", req.body);
  const { enhancements, projectKey } = req.body;
  if (!enhancements || enhancements.length === 0) {
    return res.status(400).json({ error: "No enhancements provided." });
  }
  try {
    // If projectKey is RSOFTBMS, import as stories
    if (projectKey === "RSOFTBMS") {
      const importedIds = await importEnhancements(enhancements, projectKey);
      res.json({ success: true, importedStoryIds: importedIds });
      return;
    }
    // Default: import as enhancements (RSOFT)
    const importedIds = await importEnhancements(enhancements, projectKey);
    res.json({ success: true, importedEnhancementIds: importedIds });
  } catch (error) {
    console.error("Error Importing enhancements:", error.response?.data || error.message);
    res.status(500).json({ error: "Import failed." });
  }
});
 
// GET endpoint to fetch stored enhancements by ticketId.
app.get("/api/enhancements/:ticketId", async (req, res) => {
    const { ticketId } = req.params;
    const force = req.query.force === 'true';
    if (!force && storedEnhancements[ticketId]) {
      return res.json({ enhancements: storedEnhancements[ticketId] });
    }
 
    try {
      // Detect projectKey for BMS support
      let projectKey = "RSOFT";
      if (ticketId.startsWith("RSOFTBMS-")) projectKey = "RSOFTBMS";
      // Try to fetch projectKey from query if provided
      if (req.query.projectKey) projectKey = req.query.projectKey;
      const jiraData = await fetchJiraTicket(ticketId, projectKey);
      if (!jiraData || !jiraData.description) {
        console.error(`❌ Could not fetch JIRA ticket data for ${ticketId}`);
        return res.status(404).json({ error: `JIRA ticket ${ticketId} not found or missing description.` });
      }
      if (projectKey === "RSOFTBMS" || jiraData.projectKey === "RSOFTBMS") {
        // Generate stories for BMS
        const storySummary = jiraData.user_story_summary || "No User Story Summary";
        const storyDescription = jiraData.description || "No description provided";
        const storyCheckPoints = jiraData.check_points || "No Check Points";
        const storyValidations = jiraData.validations || "No Validations";
        const storySummaryField = jiraData.summary || "No summary provided";
        const stories = await generateEnhancements({
          ticketId,
          summary: storySummaryField,
          user_story_summary: storySummary,
          check_points: storyCheckPoints,
          description: storyDescription,
          validations: storyValidations,
          projectKey: "RSOFTBMS"
        }, "");
        if (stories && stories.length > 0) {
          const formattedStories = stories.map((story, index) => ({
            story_id: story.story_id || `${ticketId}-STORY-${index + 1}`,
            summary: story.summary?.trim() || storySummaryField,
            user_story_summary: story.user_story_summary?.trim() || storySummary,
            check_points: story.check_points || storyCheckPoints,
            description: story.description?.trim() || storyDescription,
            validations: story.validations || storyValidations,
            ticket_id: ticketId // Ensure parentKey is set for linking
          }));
          storedEnhancements[ticketId] = formattedStories;
          return res.json({ enhancements: formattedStories });
        } else {
          return res.status(200).send("No stories generated.");
        }
      } else {
        // Generate enhancements for RSOFT (existing logic)
        const enhancementSummary = jiraData.summary || "No summary provided";
        const enhancementDescription = jiraData.description || "No description provided";
        const enhancementIWant = jiraData.i_want || "No i_want provided";
        const enhancementSoThat = jiraData.so_that || "No so_that provided";
        const enhancementAcceptanceCriteria = jiraData.acceptance_criteria || "No acceptance criteria provided";
        const enhancements = await generateEnhancements(
          jiraData.description,
          jiraData.i_want,
          jiraData.so_that,
          jiraData.acceptance_criteria,
          "", // no custom prompt
        );
        if (enhancements && enhancements.length > 0) {
          const formattedEnhancements = enhancements.map((enhancement, index) => ({
                enhancement_id: enhancement.enhancement_id || `${ticketId}-ENH-${index + 1}`,
                summary: enhancement.summary?.trim() || enhancementSummary,
                description: enhancement.description?.trim() || enhancementDescription,
                i_want: enhancement.i_want || enhancementIWant,
                so_that: enhancement.so_that || enhancementSoThat,
                acceptance_criteria: enhancement.acceptance_criteria || enhancementAcceptanceCriteria,
                jiraTicket: ticketId
              }));
          storedEnhancements[ticketId] = formattedEnhancements;
          console.log(`Enhancements generated for ${ticketId}:`, formattedEnhancements);
          return res.json({ enhancements: formattedEnhancements });
        } else {
          return res.status(200).send("No enhancements generated.");
        }
      }
    } catch (error) {
          console.error("❌ Error generating enhancements/stories:", error.message);
          return res.status(500).json({ error: "Failed to generate enhancements/stories." });
      }
});
 
// Add this near your other endpoints
app.get("/api/mcp-status", (req, res) => {
    console.log('📊 MCP Status Check');
    console.log('🔌 Connection Status:', mcpInitialized ? 'Connected' : 'Disconnected');
    console.log('🌐 MCP URL:', process.env.MCP_SERVER_URL);
    res.json({
        connected: mcpInitialized,
        url: process.env.MCP_SERVER_URL
    });
});
 
// Serve static assets from the React app's build folder.
app.use(express.static(path.join(__dirname, "../frontend/build")));
 
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/build", "index.html"));
});
 
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});