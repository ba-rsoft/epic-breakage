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
const { importEnhancements } = require("./utils/importEnhancements")
 
const app = express();
const server = http.createServer(app);
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
 
// Global in-memory store for enhancements (ticketId as key)
let storedEnhancements = {};
let lastAssigneeValue = {};
let lastIWantValue = {};
 
app.get("/", (req, res) => {
  res.send("✅ Express Server is Running!");
});
 
// Webhook endpoint to handle JIRA updates
app.post("/webhook", async (req, res) => {
  try {
    console.log("Webhook received");
    const { issue, changelog } = req.body;
    const ticketId = issue.key;
 
    // Process only the enhancement ticket "RSOFT-70537"
    if (ticketId !== "RSOFT-70537") {
    console.log(`Ticket ${ticketId} is not the required enhancement ticket. Ignoring update.`);
    return res.status(200).send("No relevant updates.");
    }
 
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
  } catch (error) {
    console.error("Error handling webhook:", error.message);
    return res.status(500).send("Internal Server Error");
  }
});
 
// POST endpoint to generate enhancements manually
app.post("/api/generate-enhancements", async (req, res) => {
  console.log("🚀 Received request on /api/generate-enhancements");
  const { ticketIds, customPrompts = {} } = req.body;
  console.log("📩 Request Body:", req.body);
  try {
      let allEnhancements = [];
      for (const ticketId of ticketIds) {
          console.log(`🔍 Processing ticket ID: ${ticketId}`);
 
          const jiraData = await fetchJiraTicket(ticketId);
          console.log(`📥 Fetched JIRA Data for ${ticketId}:`, jiraData);
 
          if (!jiraData || !jiraData.description) {
              console.error(`❌ Could not fetch JIRA ticket data or description is missing for ${ticketId}`);
              continue;
          }          const enhancementSummary = jiraData.summary || "No summary provided";
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
 
            console.log("Enhancement Data:", formattedEnhancements);
 
            storedEnhancements[ticketId] = formattedEnhancements;
            allEnhancements = [...allEnhancements, ...formattedEnhancements];
          }
      }
 
      if (allEnhancements.length === 0) {
          console.error("❌ No enhancements generated for any tickets.");
          return res.status(404).json({ error: "No enhancements generated. Please check the AI response or input data." });
      }
 
      console.log("📦 Final All Enhancements Sent to Frontend:", JSON.stringify(allEnhancements, null, 2));
      return res.json({ enhancements: allEnhancements });
  } catch (error) {
      console.error("💥 Error generating enhancements:", error);
      return res.status(500).json({ error: "Failed to generate enhancements." });
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
    const jiraData = await fetchJiraTicket(ticketId);
    if (!jiraData || !jiraData.description) {
      console.error(`❌ Could not fetch JIRA ticket data for ${ticketId}`);
      return res.status(404).json({ error: `JIRA ticket ${ticketId} not found or missing description.` });
    }
    // Generate new enhancements regardless of previously stored data
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
  } catch (error) {
        console.error("❌ Error generating enhancements:", error.message);
        return res.status(500).json({ error: "Failed to generate enhancements." });
    }
});
 
// Serve static assets from the React app's build folder.
app.use(express.static(path.join(__dirname, "../frontend/build")));
 
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/build", "index.html"));
});
 
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});