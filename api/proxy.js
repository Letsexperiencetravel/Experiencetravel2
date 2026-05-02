const Anthropic = require('@anthropic-ai/sdk');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const { model, max_tokens, messages, tools } = req.body;
    
    const response = await client.messages.create({
      model: model || 'claude-haiku-4-5-20251001',
      max_tokens: max_tokens || 1500,
      messages,
      ...(tools ? { tools } : {})
    });
    
    res.json(response);
  } catch (err) {
    console.error('Proxy error:', err);
    res.status(500).json({ error: err.message });
  }
};
