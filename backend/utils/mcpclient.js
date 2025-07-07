require('dotenv').config();
const EventSource = require('eventsource');

const urlMain = process.env.MCP_SERVER_URL;
const urlBms = process.env.MCP_SERVER_URL_BMS;

if (!urlMain && !urlBms) {
  console.error('❗ Set MCP_SERVER_URL and/or MCP_SERVER_URL_BMS in .env');
  process.exit(1);
}

if (urlMain) {
  console.log(`🔌 Connecting to MCP test client at ${urlMain}`);
  const esMain = new EventSource(urlMain, { headers: { Accept: 'text/event-stream' } });
  esMain.onopen = () => console.log('✅ Connected (mcpClient MAIN)');
  esMain.onmessage = (e) => {
    try {
      console.log('📨 Message (MAIN):', JSON.parse(e.data));
    } catch {
      console.log('⚠️ Raw (MAIN):', e.data);
    }
  };
  esMain.onerror = (err) => {
    console.error('❌ Error (MAIN):', err);
    esMain.close();
  };
}

if (urlBms) {
  console.log(`🔌 Connecting to MCP test client at ${urlBms}`);
  const esBms = new EventSource(urlBms, { headers: { Accept: 'text/event-stream' } });
  esBms.onopen = () => console.log('✅ Connected (mcpClient BMS)');
  esBms.onmessage = (e) => {
    try {
      console.log('📨 Message (BMS):', JSON.parse(e.data));
    } catch {
      console.log('⚠️ Raw (BMS):', e.data);
    }
  };
  esBms.onerror = (err) => {
    console.error('❌ Error (BMS):', err);
    esBms.close();
  };
}
