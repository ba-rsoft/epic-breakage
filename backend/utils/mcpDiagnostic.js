const axios = require('axios');
const dns = require('dns');
const { promisify } = require('util');
const dnsLookup = promisify(dns.lookup);

async function diagnoseConnection() {
    const url = process.env.MCP_SERVER_URL;
    const results = {
        url: url,
        dnsResolved: false,
        hostReachable: false,
        sseSupported: false,
        errors: []
    };

    if (!url) {
        results.errors.push('MCP_SERVER_URL is not defined in environment variables');
        return results;
    }

    try {
        const urlObj = new URL(url);
        
        try {
            await dnsLookup(urlObj.hostname);
            results.dnsResolved = true;
        } catch (error) {
            results.errors.push(`DNS resolution failed: ${error.message}`);
        }

        try {
            const response = await axios.get(url, {
                timeout: 5000,
                validateStatus: false
            });
            results.hostReachable = response.status < 500;
            
            const headers = response.headers;
            if (headers['content-type']?.includes('text/event-stream')) {
                results.sseSupported = true;
            } else {
                results.errors.push('Server does not support Server-Sent Events');
            }
        } catch (error) {
            results.errors.push(`Connection failed: ${error.message}`);
        }

    } catch (error) {
        results.errors.push(`Diagnosis failed: ${error.message}`);
    }

    return results;
}

module.exports = {
    diagnoseConnection
};