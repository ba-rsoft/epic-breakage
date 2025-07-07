require("dotenv").config();
const axios = require("axios");

const JIRA_BASE_URL = process.env.JIRA_BASE_URL;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;

const TEST_TICKET_ID = "rsoft-66417"; // Change this to an actual JIRA ticket ID
const TEST_CASE_ID = "RST-36730"; // Change this to an actual test case ID

// Function to fetch JIRA ticket details
async function fetchJiraTicket(ticketId) {
    try {
        console.log(`\n🚀 Fetching JIRA Ticket: ${ticketId}`);
        const response = await axios.get(`${JIRA_BASE_URL}/rest/api/2/issue/${ticketId}`, {
            auth: { username: JIRA_EMAIL, password: JIRA_API_TOKEN }
        });
        console.log("✅ JIRA Ticket Response:", response.data);
    } catch (error) {
        console.error("❌ Error Fetching JIRA Ticket:", error.response ? error.response.data : error.message);
    }
}

// Function to create a test scenario in JIRA
async function createTestScenario() {
    try {
        console.log("\n🚀 Creating Test Scenario in JIRA...");
        const payload = {
            fields: {
                project: { key: "RST" },
                summary: "Automated Test Case",
                description: {
                    type: "doc",
                    version: 1,
                    content: [
                        {
                            type: "paragraph",
                            content: [
                                { type: "text", text: "This is a test case created via API." }
                            ]
                        }
                    ]
                },
                issuetype: { name: "Test" }
            }
        };
        
        const response = await axios.post(`${JIRA_BASE_URL}/rest/api/2/issue`, payload, {
            auth: { username: JIRA_EMAIL, password: JIRA_API_TOKEN },
            headers: { "Content-Type": "application/json" }
        });
        console.log("✅ Test Scenario Created:", response.data);
    } catch (error) {
        console.error("❌ Error Creating Test Scenario:", error.response ? error.response.data : error.message);
    }
}

// Function to import test steps into JIRA
async function importTestSteps() {
    try {
        console.log("\n🚀 Importing Test Steps...");
        const stepPayload = {
            tests: [
                {
                    testKey: TEST_CASE_ID,
                    steps: [
                        { action: "Step 1: Open application", data: "", result: "App opens successfully" },
                        { action: "Step 2: Login with valid credentials", data: "", result: "User logs in" }
                    ]
                }
            ]
        };

        const response = await axios.post(`${JIRA_BASE_URL}/rest/raven/1.0/api/import/testexec`, stepPayload, {
            auth: { username: JIRA_EMAIL, password: JIRA_API_TOKEN },
            headers: { "Content-Type": "application/json" }
        });
        console.log("✅ Test Steps Imported:", response.data);
    } catch (error) {
        console.error("❌ Error Importing Test Steps:", error.response ? error.response.data : error.message);
    }
}

// Run all functions sequentially
async function testJiraApis() {
    await fetchJiraTicket(TEST_TICKET_ID);
    await createTestScenario();
    await importTestSteps();
}

testJiraApis();
