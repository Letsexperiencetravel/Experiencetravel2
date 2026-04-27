const Anthropic = require("@anthropic-ai/sdk");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "API key not configured" });
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const { messages, max_tokens } = req.body;

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: max_tokens || 800,
      messages,
    });

    const text = response.content[0].text;
    console.log("Claude response (first 300):", text.slice(0, 300));

    return res.status(200).json({
      content: [{ type: "text", text }],
    });

  } catch (err) {
    console.error("Proxy error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};
