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
  // raw_training_content
  const { data: allRaw } = await supabase.from("raw_training_content").select("id, field, title, content");
  let rawChanged = 0;
  const rawNewDist = {};
  const rawChanges = [];

  for (const item of allRaw) {
    const text = (item.title || "") + " " + (item.content || "").slice(0, 2000);
    const newField = betterClassify(text);
    const label = newField || "unclassified";
    rawNewDist[label] = (rawNewDist[label] || 0) + 1;
    if (newField && newField !== item.field) {
      rawChanged++;
      rawChanges.push({ from: item.field, to: newField });
    }
  }

  console.log("=== raw_training_content 재분류 시뮬레이션 ===");
  console.log("변경 필요:", rawChanged, "건");
  console.log("\n새 분포:");
  Object.entries(rawNewDist).sort((a, b) => b[1] - a[1]).forEach(([f, c]) => console.log(" ", f, ":", c));

  // 변경 방향 분석
  const directions = {};
  rawChanges.forEach((c) => {
    const key = `${c.from} → ${c.to}`;
    directions[key] = (directions[key] || 0) + 1;
  });
  console.log("\n변경 방향:");
  Object.entries(directions).sort((a, b) => b[1] - a[1]).forEach(([d, c]) => console.log(" ", d, ":", c, "건"));

  // training_data
  const { data: allTd } = await supabase.from("training_data").select("id, field, note_content");
  let tdChanged = 0;
  const tdNewDist = {};
  const tdChanges = [];

  for (const item of allTd) {
    const text = (item.note_content || "").slice(0, 2000);
    const newField = betterClassify(text);
    const label = newField || "unclassified";
    tdNewDist[label] = (tdNewDist[label] || 0) + 1;
    if (newField && newField !== item.field) {
      tdChanged++;
      tdChanges.push({ from: item.field, to: newField });
    }
  }

  console.log("\n=== training_data 재분류 시뮬레이션 ===");
  console.log("변경 필요:", tdChanged, "건");
  console.log("\n새 분포:");
  Object.entries(tdNewDist).sort((a, b) => b[1] - a[1]).forEach(([f, c]) => console.log(" ", f, ":", c));

  const tdDirections = {};
  tdChanges.forEach((c) => {
    const key = `${c.from} → ${c.to}`;
    tdDirections[key] = (tdDirections[key] || 0) + 1;
  });
  console.log("\n변경 방향:");
  Object.entries(tdDirections).sort((a, b) => b[1] - a[1]).forEach(([d, c]) => console.log(" ", d, ":", c, "건"));
})();
