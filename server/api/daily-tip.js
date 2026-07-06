// AI 데일리 콘텐츠 — 6개 분야별 "오늘의 팁"을 매일 자동 생성해 커뮤니티에 게시.
// 빈 커뮤니티를 채우고, 사용자 전공분야별로 볼거리를 제공.
// 크론 1일 1회. 14일 지난 AI 팁은 자동 정리(무한 누적 방지).
const { createClient } = require("@supabase/supabase-js");
const { verifyCronAuth } = require("../lib/security");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const SYSTEM_USER_ID = "612644da-473e-4f39-a532-c55f3952a7ef"; // 아트링크 코치
const POST_TYPE = "오늘의 팁";

const FIELDS = [
  { key: "acting", label: "연기", emoji: "🎭" },
  { key: "music", label: "음악", emoji: "🎵" },
  { key: "art", label: "미술", emoji: "🎨" },
  { key: "dance", label: "무용", emoji: "💃" },
  { key: "literature", label: "문학", emoji: "📖" },
  { key: "film", label: "영화", emoji: "🎬" },
];

async function generateTip(field) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const system = `당신은 ${field.label} 분야의 20년 경력 마스터 코치입니다. 아마추어~프로 아티스트가 오늘 바로 적용할 수 있는 실전 팁 하나를 제시하세요.

규칙:
- 한국어. 250~400자.
- 첫 줄은 흥미로운 제목 한 줄 (이모지 ${field.emoji} 로 시작).
- 본문은 구체적이고 실전적으로. 추상적 격려 금지.
- 전문 용어는 괄호로 쉽게 풀어주기.
- 마크다운(**, #, -) 쓰지 말 것. 일반 텍스트만.
- "오늘의 팁" 형식으로 바로 시작. 인사말·자기소개 금지.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      temperature: 1,
      system,
      messages: [{ role: "user", content: `오늘의 ${field.label} 팁을 하나 알려주세요. 매번 다른 주제로.` }],
    }),
  });
  if (!res.ok) throw new Error(`AI ${res.status}`);
  const data = await res.json();
  const text = (data.content?.[0]?.text || "").trim();
  if (!text) throw new Error("empty");
  // 첫 줄 = 제목, 나머지 = 본문
  const lines = text.split("\n").filter((l) => l.trim());
  const title = lines[0].slice(0, 60);
  const content = lines.length > 1 ? lines.slice(1).join("\n").trim() : text;
  return { title, content };
}

module.exports = async function handler(req, res) {
  const auth = verifyCronAuth(req);
  if (!auth.ok) return res.status(401).json({ error: "Unauthorized" });

  // 특정 분야만 생성하려면 ?field=acting
  const only = req.query && req.query.field;
  const targets = only ? FIELDS.filter((f) => f.key === only) : FIELDS;

  const results = [];
  for (const field of targets) {
    try {
      const { title, content } = await generateTip(field);
      const { error } = await supabase.from("community_posts").insert({
        user_id: SYSTEM_USER_ID,
        author_name: "아트링크 코치",
        author_field: field.key,
        type: POST_TYPE,
        title,
        content,
      });
      if (error) throw error;
      results.push({ field: field.key, status: "posted" });
    } catch (e) {
      console.error(`[daily-tip] ${field.key}:`, e.message);
      results.push({ field: field.key, status: "error", error: e.message });
    }
  }

  // 14일 이상 된 AI 팁 정리 (무한 누적 방지)
  try {
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    await supabase
      .from("community_posts")
      .delete()
      .eq("user_id", SYSTEM_USER_ID)
      .lt("created_at", cutoff);
  } catch (e) {
    console.error("[daily-tip] cleanup:", e.message);
  }

  console.log("[daily-tip]", JSON.stringify(results));
  return res.status(200).json({ ok: true, results });
};
