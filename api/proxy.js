const https = require('https');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  try {
    const { model, max_tokens, messages, tools, system } = req.body;
    const apiKey = process.env.ANTHROPIC_API_KEY;

    const callAnthropic = (body) => new Promise((resolve, reject) => {
      const bodyStr = JSON.stringify(body);
      const options = {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'web-search-2025-03-05',
          'Content-Length': Buffer.byteLength(bodyStr)
        }
      };
      const reqHttp = https.request(options, (r) => {
        let data = '';
        r.on('data', chunk => data += chunk);
        r.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch(e) { reject(new Error('Bad JSON from Anthropic: ' + data.slice(0,200))); }
        });
      });
      reqHttp.on('error', reject);
      reqHttp.write(bodyStr);
      reqHttp.end();
    });

    const hasWebSearch = tools && tools.some(t => t.type === 'web_search_20250305');

    if (hasWebSearch) {
      // Agentic loop for web search
      let currentMessages = [...messages];
      let finalText = '';
      const MAX_ROUNDS = 6;

      for (let round = 0; round < MAX_ROUNDS; round++) {
        const body = {
          model: model || 'claude-sonnet-4-20250514',
          max_tokens: max_tokens || 4000,
          messages: currentMessages,
          tools: tools
        };
        if (system) body.system = system;

        const response = await callAnthropic(body);

        if (response.error) {
          console.error('Anthropic error:', response.error);
          return res.status(500).json({ error: response.error.message || 'Anthropic API error' });
        }

        // Collect text
        const textBlocks = (response.content || []).filter(b => b.type === 'text');
        if (textBlocks.length) finalText += textBlocks.map(b => b.text).join('');

        // Check for tool use
        const toolUseBlocks = (response.content || []).filter(b => b.type === 'tool_use');
        if (response.stop_reason === 'end_turn' || toolUseBlocks.length === 0) break;

        // Add assistant turn
        currentMessages.push({ role: 'assistant', content: response.content });

        // Add tool results (web_search handles itself server-side)
        const toolResults = toolUseBlocks.map(block => ({
          type: 'tool_result',
          tool_use_id: block.id,
          content: block.output || ''
        }));
        currentMessages.push({ role: 'user', content: toolResults });
      }

      return res.json({ content: [{ type: 'text', text: finalText }], stop_reason: 'end_turn' });

    } else {
      // Simple request
      const body = {
        model: model || 'claude-haiku-4-5-20251001',
        max_tokens: max_tokens || 1500,
        messages
      };
      if (system) body.system = system;
      if (tools) body.tools = tools;

      const response = await callAnthropic(body);
      if (response.error) return res.status(500).json({ error: response.error.message });
      res.json(response);
    }

  } catch (err) {
    console.error('Proxy error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
