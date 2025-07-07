const { EventSource } = require('eventsource');
const EventEmitter = require('events');
const { MCP_SERVER_URL, MCP_SERVER_URL_BMS } = require('../config/mcpServers');

console.log('Loaded MCP_SERVER_URL:', MCP_SERVER_URL);
console.log('Loaded MCP_SERVER_URL_BMS:', MCP_SERVER_URL_BMS);

class MCPService extends EventEmitter {
  constructor() {
    super();
    this.es = null;
    this.esBms = null;
    this.isConnected = false;
    this.isConnectedBms = false;
    this.retryCount = 0;
    this.retryCountBms = 0;
    this.maxRetries = 5;
    this.retryInterval = 5000;
  }

  connect(urlOverride) {
    return new Promise((resolve, reject) => {
      const url = urlOverride || process.env.MCP_SERVER_URL;
      console.log('Attempting to connect to MCP server with URL:', url);
      if (!url) {
        reject(new Error('MCP_SERVER_URL is not defined in environment variables'));
        return;
      }
      
      console.log(`🔌 Connecting to MCP Server at ${url}`);

      this.es = new EventSource(url, { headers: { Accept: 'text/event-stream' } });

      this.es.onopen = () => {
        console.log('✅ MCP: Connection opened');
        this.isConnected = true;
        this.retryCount = 0;
        this.emit('connected');
        resolve();
      };

      this.es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          console.log('📨 MCP: message', data);
          this.emit('message', data);
        } catch (err) {
          console.error('⚠️ MCP: parsing error', err);
        }
      };

      this.es.onerror = (err) => {
        console.error('⚠️ MCP: connection error', err);
        this.es.close();
        this.isConnected = false;
        if (++this.retryCount <= this.maxRetries) {
          console.log(`🔁 MCP: reconnect in ${this.retryInterval}ms (attempt ${this.retryCount}/${this.maxRetries})`);
          setTimeout(() => this.connect().catch(reject), this.retryInterval);
        } else {
          console.error('⚡ MCP: max retries reached, fallback triggered');
          this.emit('fallback', err);
          reject(err);
        }
      };
    });
  }

  connectBoth() {
    // Connect to both MCP_SERVER_URL and MCP_SERVER_URL_BMS
    console.log('Connecting to both MCP_SERVER_URL and MCP_SERVER_URL_BMS...');
    return Promise.all([
      this.connect(MCP_SERVER_URL),
      this.connect(MCP_SERVER_URL_BMS)
    ]);
  }

  disconnect() {
    if (this.es) {
      console.log('🔌 MCP: disconnecting');
      this.es.close();
      this.isConnected = false;
      this.es = null;
    }
    if (this.esBms) {
      console.log('🔌 MCP: disconnecting BMS');
      this.esBms.close();
      this.isConnectedBms = false;
      this.esBms = null;
    }
  }
}

function getMcpServerUrl(projectKey) {
    if (projectKey === 'RSOFTBMS') {
        console.log('getMcpServerUrl: Using MCP_SERVER_URL_BMS for projectKey', projectKey);
        return MCP_SERVER_URL_BMS;
    }
    console.log('getMcpServerUrl: Using MCP_SERVER_URL for projectKey', projectKey);
    return MCP_SERVER_URL;
}

module.exports = new MCPService();
module.exports.getMcpServerUrl = getMcpServerUrl;
