const { supabase } = require("../lib/supabase");

const BATCH_SIZE = 10;

const FIELD_LABELS = {
  acting: "연기",
  music: "음악",
  dance: "무용",
  art: "미술",
  film: "영화/영상",
  literature: "문학/글쓰기",
};

function buildPrompt(field, content) {
  const fieldLabel = FIELD_LABELS[field] || field;
  return {
    system: `당신은 ${fieldLabel} 분야의 전문 코치입니다. 다음 연습 노트에 대해 간결하고 구체적인 피드백을 제공하세요.

반드시 다음 형식으로 답변하세요:
📌 강점 (2-3개)
- 구체적인 강점

📌 개선점 (2-3개)
- 구체적인 개선 제안

📌 다음 스텝 (1개)
- 다음에 시도해볼 구체적인 연습/활동`,
    user: `[${fieldLabel} 연습 노트]\n\n${content.slice(0, 3000)}`,
  };
}

async function generateFeedback(systemPrompt, userMessage) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  return data.content && data.content[0] && data.content[0].text
    ? data.content[0].text
    : "";
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Auth
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers["authorization"] || "";
    const vercelCron = req.headers["x-vercel-cron-secret"] || "";
    if (authHeader !== `Bearer ${cronSecret}` && vercelCron !== cronSecret) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  if (!supabase) {
    return res.status(500).json({ error: "Supabase not configured" });
  }

  // Fetch unprocessed raw content
  const { data: rawItems, error: fetchError } = await supabase
    .from("raw_training_content")
    .select("*")
    .eq("processed", false)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (fetchError) {
    return res.status(500).json({ error: "DB fetch error", detail: fetchError.message });
  }

  if (!rawItems || rawItems.length === 0) {
    return res.status(200).json({ message: "No unprocessed items", processed: 0 });
  }

  const results = [];
  const startTime = Date.now();

  for (const item of rawItems) {
    // Check remaining time (leave 10s buffer)
    if (Date.now() - startTime > 48000) {
      results.push({ id: item.id, status: "skipped", reason: "timeout_approaching" });
      continue;
    }

    try {
      const { system, user } = buildPrompt(item.field, item.content);
      const feedback = await generateFeedback(system, user);

      if (!feedback) {
        results.push({ id: item.id, status: "error", error: "Empty AI response" });
        continue;
      }

      // Insert into training_data
      const { error: insertError } = await supabase.from("training_data").insert({
        field: item.field,
        note_content: item.content.slice(0, 5000),
        ai_feedback: feedback,
        source: `crawl_${item.source}`,
      });

      if (insertError) {
        console.error(`[training-generate] Insert error for ${item.id}:`, insertError.message);
        results.push({ id: item.id, status: "error", error: insertError.message });
        continue;
      }

      // Mark as processed
      await supabase
        .from("raw_training_content")
        .update({ processed: true })
        .eq("id", item.id);

      results.push({ id: item.id, status: "success", field: item.field });
    } catch (err) {
      console.error(`[training-generate] Failed for ${item.id}:`, err.message);
      results.push({ id: item.id, status: "error", error: err.message });
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const successCount = results.filter((r) => r.status === "success").length;

  return res.status(200).json({
    message: "Training generation complete",
    duration: `${duration}s`,
    processed: successCount,
    total: rawItems.length,
    results,
  });
};
