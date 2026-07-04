// Vercel serverless function: POST /api/moderate
// AI content moderation using Claude Haiku for arts community

const Anthropic = require("@anthropic-ai/sdk");

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("[MODERATE] ANTHROPIC_API_KEY not configured");
}
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `당신은 예술 커뮤니티의 콘텐츠 모더레이터입니다.
사용자가 작성한 글이나 댓글이 커뮤니티 가이드라인에 적합한지 판단합니다.

다음 경우 safe: false로 판단하세요:
- 욕설, 비속어, 모욕적 표현
- 혐오 발언, 차별적 표현
- 성적으로 노골적인 콘텐츠
- 스팸, 광고, 사기
- 자해/폭력 조장
- 다른 사용자에 대한 인신공격, 비방
- 예술 활동과 무관한 악의적 콘텐츠

다음은 허용합니다:
- 건설적인 비평과 피드백 (작품에 대한 솔직한 의견)
- 예술 관련 토론과 질문
- 콜라보/네트워킹 게시글
- 일상적 대화

반드시 JSON으로만 응답하세요: {"safe": true} 또는 {"safe": false, "reason": "사유"}`;

const { applySecurityChecks } = require("../lib/security");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-App-Token");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 보안: Rate limit (분당 30회 — 매 게시글/댓글마다 호출) + App token
  if (applySecurityChecks(req, res, { maxRequests: 30 })) return;

  if (!req.body || typeof req.body !== "object") {
    return res.status(400).json({ error: "Invalid request body" });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(200).json({ safe: true, reason: "moderation_not_configured" });
  }

  const { content, type } = req.body;

  if (!content || typeof content !== "string") {
    return res.status(400).json({ error: "content is required" });
  }

  // 콘텐츠 길이 제한 — 의도적 타임아웃 유도 공격 방지
  if (content.length > 5000) {
    return res.status(400).json({ error: "Content too long (max 5000 chars)" });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const message = await client.messages.create(
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 100,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `[${type === "comment" ? "댓글" : "게시글"}] ${content}`,
          },
        ],
      },
      { signal: controller.signal }
    );

    const text = message.content[0]?.text || "";

    // Parse JSON separately — if Claude returns bad JSON, fail-closed (block)
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.error("[MODERATE] JSON parse failed:", text);
      return res.status(200).json({ safe: false, reason: "moderation_parse_error" });
    }

    return res.status(200).json({
      safe: parsed.safe === true,
      reason: parsed.reason || null,
    });
  } catch (err) {
    console.error("[MODERATE ERROR]", err.message);
    // Fail-closed: AI 체크 실패 시 콘텐츠 차단 (안전 우선)
    return res.status(200).json({ safe: false, reason: "moderation_unavailable" });
  } finally {
    clearTimeout(timeout);
  }
};
