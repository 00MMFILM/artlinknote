const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const FIELD_KEYWORDS = {
  acting: ["배우", "연기", "캐스팅", "드라마", "출연", "엑스트라", "단역", "주연", "조연", "성우", "보이스", "시트콤", "연극", "뮤지컬배우", "오디션", "대본", "캐릭터 분석", "장면", "동선", "감정연기", "즉흥", "합독", "셀프테이프", "모노로그"],
  music: ["음악", "보컬", "작곡", "연주", "밴드", "합창", "오케스트라", "피아노", "기타 연습", "클래식", "싱어", "가수", "악보", "음계", "코드", "청음", "박자", "합주", "바이올린", "드럼", "미디", "발성연습", "노래 레슨", "음악학원"],
  dance: ["무용", "댄스", "발레", "한국무용", "현대무용", "안무", "댄서", "스트릿댄스", "방송댄스", "피지컬시어터", "스트레칭", "턴", "컨디셔닝", "왁킹", "팝핑", "힙합댄스", "컨템포러리"],
  art: ["미술", "전시", "회화", "조각", "설치", "공예", "디자인", "일러스트", "사진", "갤러리", "레지던시", "미디어아트", "디지털아트", "드로잉", "크로키", "스케치", "수채화", "유화", "데생", "아크릴화"],
  film: ["영상", "촬영", "감독", "시나리오", "단편", "다큐", "영화", "장편", "단편영화", "조명", "녹음", "편집", "콘티", "촬영일지", "색보정"],
  literature: ["문학", "소설", "시 창작", "수필", "글쓰기", "웹소설", "시인", "작가", "문예", "원고", "출판", "시낭독", "집필", "퇴고", "초고", "에세이", "필사"],
};

function betterClassify(text) {
  if (!text) return null;
  const scores = {};
  for (const [field, keywords] of Object.entries(FIELD_KEYWORDS)) {
    scores[field] = keywords.filter((kw) => text.includes(kw)).length;
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : null;
}

(async () => {
  // === 1. raw_training_content 재분류 ===
  console.log("=== raw_training_content 재분류 시작 ===");
  const { data: allRaw } = await supabase.from("raw_training_content").select("id, field, title, content");

  let rawUpdated = 0;
  let rawDeleted = 0;

  for (const item of allRaw) {
    const text = (item.title || "") + " " + (item.content || "").slice(0, 2000);
    const newField = betterClassify(text);

    if (!newField) {
      // unclassified → 삭제
      await supabase.from("raw_training_content").delete().eq("id", item.id);
      rawDeleted++;
    } else if (newField !== item.field) {
      await supabase.from("raw_training_content").update({ field: newField }).eq("id", item.id);
      rawUpdated++;
    }
  }
  console.log("재분류:", rawUpdated, "건 / 스팸 삭제:", rawDeleted, "건");

  // === 2. training_data 재분류 ===
  console.log("\n=== training_data 재분류 시작 ===");
  const { data: allTd } = await supabase.from("training_data").select("id, field, note_content");

  let tdUpdated = 0;
  let tdDeleted = 0;

  for (const item of allTd) {
    const text = (item.note_content || "").slice(0, 2000);
    const newField = betterClassify(text);

    if (!newField) {
      await supabase.from("training_data").delete().eq("id", item.id);
      tdDeleted++;
    } else if (newField !== item.field) {
      await supabase.from("training_data").update({ field: newField }).eq("id", item.id);
      tdUpdated++;
    }
  }
  console.log("재분류:", tdUpdated, "건 / 스팸 삭제:", tdDeleted, "건");

  // === 3. 최종 분포 확인 ===
  console.log("\n=== 최종 분포 확인 ===");
  const { data: finalRaw } = await supabase.from("raw_training_content").select("field");
  const { data: finalTd } = await supabase.from("training_data").select("field");

  const rawDist = {};
  finalRaw.forEach((r) => (rawDist[r.field] = (rawDist[r.field] || 0) + 1));
  console.log("raw_training_content (총 " + finalRaw.length + "건):");
  Object.entries(rawDist).sort((a, b) => b[1] - a[1]).forEach(([f, c]) => console.log(" ", f, ":", c));

  const tdDist = {};
  finalTd.forEach((r) => (tdDist[r.field] = (tdDist[r.field] || 0) + 1));
  console.log("\ntraining_data (총 " + finalTd.length + "건):");
  Object.entries(tdDist).sort((a, b) => b[1] - a[1]).forEach(([f, c]) => console.log(" ", f, ":", c));

  console.log("\n완료!");
})();
