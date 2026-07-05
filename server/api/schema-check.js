// DB 스키마 상시 감시 — 코드가 의존하는 테이블/제약이 실제 DB에 있는지 매일 자가 점검.
// "조용한 실패"(테이블/제약 누락으로 insert·upsert가 소리 없이 실패) 재발 방지용.
// 하루 1회 크론이 호출. 문제 발견 시 [SCHEMA-ALERT] 로그를 크게 남기고 HTTP 500 반환.
const { createClient } = require("@supabase/supabase-js");
const { verifyCronAuth } = require("../lib/security");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// 코드가 실제로 쓰는 테이블 (db-schema-check.py의 스캔 결과와 동기화 유지)
const EXPECTED_TABLES = [
  "anonymous_ai_metadata", "artist_profiles", "community_comments", "community_likes",
  "community_posts", "crawl_logs", "funnel_events", "growth_vectors", "mau_tracking",
  "postings", "proposal_replies", "proposals", "raw_training_content", "reports",
  "training_data", "user_notes", "users",
];

// upsert(onConflict) 지점 — [테이블, 컬럼, sentinel payload]
// 42P10(제약 없음)만 실패로 판정. 다른 에러는 제약이 존재한다는 증거.
const EXPECTED_CONFLICTS = [
  ["mau_tracking", "device_id,month", { device_id: "__probe__", month: "1999-01" }],
  ["funnel_events", "device_id,event", { device_id: "__probe__", event: "new_open" }],
  ["training_data", "content_hash", { content_hash: "__probe__", field: "etc", note_content: "x", ai_feedback: "x" }],
  ["growth_vectors", "user_id,field", { user_id: "00000000-0000-0000-0000-0000000000ff", field: "__probe__", vector: [], potential_score: 0 }],
  ["postings", "source_url", { source_url: "__probe_sentinel__", title: "probe", source: "__probe__", field: "etc" }],
  ["artist_profiles", "user_id", { user_id: "00000000-0000-0000-0000-0000000000ff" }],
  ["user_notes", "auth_user_id,local_id", { auth_user_id: "00000000-0000-0000-0000-0000000000ff", local_id: "__probe__" }],
  ["raw_training_content", "source_url", { source_url: "__probe_sentinel__", content: "x", source: "__probe__" }],
];

module.exports = async function handler(req, res) {
  const auth = verifyCronAuth(req);
  if (!auth.ok) return res.status(401).json({ error: "Unauthorized" });

  const problems = [];

  // ① 테이블 존재
  for (const t of EXPECTED_TABLES) {
    const { error } = await supabase.from(t).select("*").limit(1);
    if (error && (error.code === "PGRST205" || /does not exist|find the table/i.test(error.message || ""))) {
      problems.push(`missing table: ${t}`);
    }
  }

  // ② onConflict 제약 (sentinel merge-duplicates 프로브 → 42P10이면 제약 없음)
  for (const [table, cols, payload] of EXPECTED_CONFLICTS) {
    const { error } = await supabase.from(table).upsert(payload, { onConflict: cols });
    if (error && (error.code === "42P10" || /no unique or exclusion/i.test(error.message || ""))) {
      problems.push(`missing constraint: ${table} (${cols})`);
    }
    // sentinel 정리
    const firstCol = cols.split(",")[0];
    if (payload[firstCol] !== undefined) {
      await supabase.from(table).delete().eq(firstCol, payload[firstCol]);
    }
  }

  if (problems.length) {
    console.error("[SCHEMA-ALERT] DB 스키마 불일치 감지:", JSON.stringify(problems));
    return res.status(500).json({ ok: false, problems });
  }
  console.log("[schema-check] OK — 코드/DB 스키마 일치");
  return res.status(200).json({ ok: true, checked: EXPECTED_TABLES.length + EXPECTED_CONFLICTS.length });
};
