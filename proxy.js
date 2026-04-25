const Anthropic = require("@anthropic-ai/sdk");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ 
      error: "API key not set. Add ANTHROPIC_API_KEY in Vercel environment variables." 
    });
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const { messages, max_tokens } = req.body;

    console.log("Calling Claude...");

    const response = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: max_tokens || 1500,
      messages,
    });

    console.log("Success:", response.stop_reason);
    return res.status(200).json(response);

  } catch (err) {
    console.error("Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};
