const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// "기타" 복원 + 다른 의미의 "기타"(etc)와 구분하기 위해
// 음악 맥락 키워드를 보강
const FIELD_KEYWORDS = {
  acting: ["배우", "연기", "캐스팅", "드라마", "출연", "엑스트라", "단역", "주연", "조연", "성우", "보이스", "시트콤", "연극", "뮤지컬배우", "오디션", "대본", "캐릭터 분석", "장면", "동선", "감정연기", "즉흥", "합독", "셀프테이프", "모노로그"],
  music: ["음악", "보컬", "작곡", "연주", "밴드", "합창", "오케스트라", "피아노", "기타 연습", "기타 레슨", "기타리스트", "어쿠스틱", "일렉기타", "클래식기타", "클래식", "싱어", "가수", "악보", "음계", "코드 진행", "코드 연습", "청음", "박자", "합주", "바이올린", "드럼", "미디", "발성연습", "노래 레슨", "음악학원", "보컬 레슨", "보컬 연습", "음정", "리듬", "화성학", "작사"],
  dance: ["무용", "댄스", "발레", "한국무용", "현대무용", "안무", "댄서", "스트릿댄스", "방송댄스", "피지컬시어터", "턴", "컨디셔닝", "왁킹", "팝핑", "힙합댄스", "컨템포러리"],
  art: ["미술", "전시", "회화", "조각", "설치", "공예", "일러스트", "갤러리", "레지던시", "미디어아트", "디지털아트", "드로잉", "크로키", "스케치", "수채화", "유화", "데생", "아크릴화"],
  film: ["영상 제작", "촬영", "감독", "시나리오", "단편영화", "다큐", "영화", "장편", "조명", "녹음", "영상 편집", "콘티", "촬영일지", "색보정"],
  literature: ["문학", "소설", "시 창작", "수필", "글쓰기", "웹소설", "시인", "작가", "문예", "출판", "시낭독", "집필", "퇴고", "초고", "에세이", "필사"],
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

async function fetchAll(table, select) {
  const all = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + PAGE - 1);
    if (error) { console.error("Fetch error:", error.message); break; }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

(async () => {
  // === training_data 재분류 (전체) ===
  console.log("=== training_data 전체 재분류 ===");
  const allTd = await fetchAll("training_data", "id, field, note_content");
  console.log("총 조회:", allTd.length, "건");

  let updated = 0;
  let deleted = 0;
  const newDist = {};

  for (const item of allTd) {
    const text = (item.note_content || "").slice(0, 2000);
    const newField = betterClassify(text);

    if (!newField) {
      await supabase.from("training_data").delete().eq("id", item.id);
      deleted++;
    } else {
      newDist[newField] = (newDist[newField] || 0) + 1;
      if (newField !== item.field) {
        await supabase.from("training_data").update({ field: newField }).eq("id", item.id);
        updated++;
      }
    }
  }

  console.log("재분류:", updated, "건 / 삭제:", deleted, "건");
  console.log("\n최종 분포:");
  Object.entries(newDist).sort((a, b) => b[1] - a[1]).forEach(([f, c]) => console.log(" ", f, ":", c));

  // === raw_training_content도 동일 키워드로 재분류 ===
  console.log("\n=== raw_training_content 전체 재분류 ===");
  const allRaw = await fetchAll("raw_training_content", "id, field, title, content");
  console.log("총 조회:", allRaw.length, "건");

  let rawUpdated = 0;
  let rawDeleted = 0;
  const rawDist = {};

  for (const item of allRaw) {
    const text = (item.title || "") + " " + (item.content || "").slice(0, 2000);
    const newField = betterClassify(text);

    if (!newField) {
      await supabase.from("raw_training_content").delete().eq("id", item.id);
      rawDeleted++;
    } else {
      rawDist[newField] = (rawDist[newField] || 0) + 1;
      if (newField !== item.field) {
        await supabase.from("raw_training_content").update({ field: newField }).eq("id", item.id);
        rawUpdated++;
      }
    }
  }

  console.log("재분류:", rawUpdated, "건 / 삭제:", rawDeleted, "건");
  console.log("\n최종 분포:");
  Object.entries(rawDist).sort((a, b) => b[1] - a[1]).forEach(([f, c]) => console.log(" ", f, ":", c));

  console.log("\n완료!");
})();
