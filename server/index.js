const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "10kb" }));

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// AI Analyze endpoint (delegates to Anthropic API)
app.post("/api/ai-analyze", async (req, res) => {
  const { systemPrompt, userMessage } = req.body;

  if (!systemPrompt || !userMessage) {
    return res.status(400).json({ error: "systemPrompt and userMessage are required" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Server API key not configured" });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Anthropic API error ${response.status}:`, errorBody);
      return res.status(502).json({ error: "AI service error" });
    }

    const data = await response.json();
    const result =
      data.content && data.content[0] && data.content[0].text
        ? data.content[0].text
        : "";

    if (!result) {
      return res.status(502).json({ error: "Empty AI response" });
    }

    return res.json({ result });
  } catch (err) {
    console.error("AI analyze error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(PORT, () => {
  console.log(`Artlink server running on port ${PORT}`);
});
