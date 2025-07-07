// config/mcpServers.js
require('dotenv').config();

const MCP_SERVER_URL = process.env.MCP_SERVER_URL;
const MCP_SERVER_URL_BMS = process.env.MCP_SERVER_URL_BMS;

module.exports = {
  MCP_SERVER_URL,
  MCP_SERVER_URL_BMS
};
