const Anthropic = require('@anthropic-ai/sdk');

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
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const { model, max_tokens, messages, tools, system } = req.body;

    const hasWebSearch = tools && tools.some(t => t.type === 'web_search_20250305');

    if (hasWebSearch) {
      // Agentic loop: handle tool_use → tool_result rounds until final text
      let currentMessages = [...messages];
      let finalText = '';
      const MAX_ROUNDS = 5;

      for (let round = 0; round < MAX_ROUNDS; round++) {
        const response = await client.messages.create({
          model: model || 'claude-sonnet-4-20250514',
          max_tokens: max_tokens || 4000,
          messages: currentMessages,
          tools: tools,
          ...(system ? { system } : {})
        });

        // Collect any text from this round
        const textBlocks = response.content.filter(b => b.type === 'text');
        if (textBlocks.length) {
          finalText += textBlocks.map(b => b.text).join('');
        }

        // If stop_reason is end_turn or no tool_use, we're done
        const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
        if (response.stop_reason === 'end_turn' || toolUseBlocks.length === 0) {
          break;
        }

        // Add assistant response to messages
        currentMessages.push({ role: 'assistant', content: response.content });

        // Build tool results for each tool_use block
        const toolResults = toolUseBlocks.map(block => ({
          type: 'tool_result',
          tool_use_id: block.id,
          content: block.type === 'web_search_20250305'
            ? 'Search completed. Use your knowledge of this topic.'
            : ''
        }));

        currentMessages.push({ role: 'user', content: toolResults });
      }

      // Return synthetic response with collected text
      return res.json({
        content: [{ type: 'text', text: finalText }],
        stop_reason: 'end_turn'
      });

    } else {
      // Simple single-round request (no tools)
      const response = await client.messages.create({
        model: model || 'claude-haiku-4-5-20251001',
        max_tokens: max_tokens || 1500,
        messages,
        ...(system ? { system } : {}),
        ...(tools ? { tools } : {})
      });
      res.json(response);
    }

  } catch (err) {
    console.error('Proxy error:', err);
    res.status(500).json({ error: err.message });
  }
};
