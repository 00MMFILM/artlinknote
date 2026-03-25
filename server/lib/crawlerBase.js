const cheerio = require("cheerio");
const { supabase } = require("./supabase");

// --- Anti-Detection: UA Rotation ---

const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:134.0) Gecko/20100101 Firefox/134.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1",
];

function getRandomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// --- Anti-Detection: Random Delay ---

function randomDelay(minMs = 1000, maxMs = 3000) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Anti-Detection: Request Cache (per-session dedup) ---

const _requestCache = new Map();
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

function getCachedHTML(url) {
  const entry = _requestCache.get(url);
  if (entry && Date.now() - entry.ts < CACHE_TTL) {
    return entry.html;
  }
  _requestCache.delete(url);
  return null;
}

function setCachedHTML(url, html) {
  // Cap cache at 200 entries to avoid memory bloat in serverless
  if (_requestCache.size > 200) {
    const oldest = _requestCache.keys().next().value;
    _requestCache.delete(oldest);
  }
  _requestCache.set(url, { html, ts: Date.now() });
}

// --- Field Classification ---

const FIELD_KEYWORDS = {
  acting: [
    "배우", "연기", "캐스팅", "드라마", "출연", "엑스트라", "단역", "주연",
    "조연", "성우", "보이스", "시트콤", "연극", "뮤지컬배우", "오디션",
  ],
  music: [
    "음악", "보컬", "작곡", "연주", "밴드", "합창", "오케스트라", "피아노",
    "기타", "클래식", "뮤지컬", "싱어", "가수", "음악극",
  ],
  dance: [
    "무용", "댄스", "발레", "한국무용", "현대무용", "안무", "댄서",
    "스트릿댄스", "방송댄스", "피지컬시어터",
  ],
  art: [
    "미술", "전시", "회화", "조각", "설치", "공예", "디자인", "일러스트",
    "사진", "갤러리", "레지던시", "미디어아트", "디지털아트",
  ],
  film: [
    "영상", "촬영", "감독", "시나리오", "단편", "다큐", "영화", "장편",
    "단편영화", "스태프", "조명", "녹음", "편집",
  ],
  literature: [
    "문학", "소설", "시", "수필", "글쓰기", "웹소설", "시인", "작가",
    "문예", "원고", "출판", "시낭독",
  ],
};

function classifyField(text) {
  if (!text) return "acting";
  const scores = {};
  for (const [field, keywords] of Object.entries(FIELD_KEYWORDS)) {
    scores[field] = keywords.filter((kw) => text.includes(kw)).length;
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : "acting";
}

// --- Tab Classification ---

function classifyTab(title, category, description) {
  const text = `${title} ${category || ""} ${description || ""}`;
  if (/오디션|캐스팅|모집/.test(text)) return "오디션";
  if (/콜라보|협업|융합|합작/.test(text)) return "콜라보";
  return "프로젝트";
}

// --- Requirements Extraction ---

function extractRequirements(text) {
  if (!text) return {};
  const req = {};

  // Gender
  if (/여[성자]/.test(text)) req.gender = "female";
  else if (/남[성자]/.test(text)) req.gender = "male";

  // Age range
  const ageMatch = text.match(/(\d{2})\s*[~\-세]\s*(\d{2})\s*세?/);
  if (ageMatch) req.ageRange = [parseInt(ageMatch[1]), parseInt(ageMatch[2])];

  // Height range
  const heightMatch = text.match(/(\d{3})\s*[~\-cm]+\s*(\d{3})/);
  if (heightMatch) req.heightRange = [parseInt(heightMatch[1]), parseInt(heightMatch[2])];

  // Location
  const locationMatch = text.match(/(서울|경기|부산|대구|인천|광주|대전|울산|세종|강원|충북|충남|전북|전남|경북|경남|제주)/);
  if (locationMatch) req.location = locationMatch[1];

  // Specialties
  const specialtyKeywords = [
    "발레", "현대무용", "한국무용", "재즈댄스", "탭댄스",
    "피아노", "기타", "바이올린", "드럼", "노래",
    "수영", "승마", "검도", "태권도", "무술",
    "영어", "일본어", "중국어",
  ];
  const specialties = specialtyKeywords.filter((kw) => text.includes(kw));
  if (specialties.length > 0) req.specialties = specialties;

  return req;
}

// --- HTML Fetching (with UA rotation, caching, browser-like headers) ---

async function fetchHTML(url, { skipCache = false } = {}) {
  // Check cache first — avoid duplicate requests within 6h window
  if (!skipCache) {
    const cached = getCachedHTML(url);
    if (cached) {
      console.log(`[cache hit] ${url}`);
      return cheerio.load(cached);
    }
  }

  const ua = getRandomUA();
  const referer = new URL(url).origin + "/";

  const res = await fetch(url, {
    headers: {
      "User-Agent": ua,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      "Accept-Encoding": "gzip, deflate, br",
      "Referer": referer,
      "Connection": "keep-alive",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "same-origin",
      "Sec-Fetch-User": "?1",
      "Cache-Control": "max-age=0",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const html = await res.text();

  // Cache the response
  setCachedHTML(url, html);

  return cheerio.load(html);
}

// --- DB Operations ---

async function upsertPostings(postings, source) {
  if (!supabase) throw new Error("Supabase not configured");
  if (!postings || postings.length === 0) return { new: 0, total: 0 };

  let newCount = 0;
  for (const posting of postings) {
    const record = {
      source,
      source_url: posting.source_url,
      title: posting.title,
      company: posting.company || null,
      field: posting.field || classifyField(`${posting.title} ${posting.description || ""}`),
      category: posting.category || null,
      description: posting.description || null,
      requirements: posting.requirements || extractRequirements(posting.description || ""),
      deadline: posting.deadline || null,
      pay: posting.pay || null,
      location: posting.location || null,
      contact: posting.contact || null,
      tags: posting.tags || [],
      tab: posting.tab || classifyTab(posting.title, posting.category, posting.description),
      status: "active",
    };

    const { error } = await supabase
      .from("postings")
      .upsert(record, { onConflict: "source_url", ignoreDuplicates: false });

    if (error) {
      console.error(`Upsert error for ${posting.source_url}:`, error.message);
    } else {
      newCount++;
    }
  }

  return { new: newCount, total: postings.length };
}

async function logCrawl(source, { itemsFound = 0, itemsNew = 0, status = "success", error = null } = {}) {
  if (!supabase) return;
  await supabase.from("crawl_logs").insert({
    source,
    finished_at: new Date().toISOString(),
    items_found: itemsFound,
    items_new: itemsNew,
    status,
    error_message: error,
  });
}

// --- Training Content Quality Filter ---

// 광고/협찬 키워드 (하나라도 포함되면 즉시 제외)
const AD_REJECT_KEYWORDS = [
  // 법적 광고 고지
  "광고 포함", "유료 광고", "협찬", "소정의 원고료", "소정의 수수료",
  "제품을 제공받", "서비스를 제공받", "원고료를 지급", "원고료를 제공",
  "대가를 받고", "경제적 대가", "무상으로 제공",
  // 제휴 마케팅
  "쿠팡 파트너스", "쿠팡파트너스", "파트너스 활동", "일정액의 수수료",
  "제휴 마케팅", "알리익스프레스 파트너",
  // 체험단/리뷰단
  "체험단", "기자단", "리뷰단", "서포터즈", "앰배서더",
  // 쇼핑/구매 유도
  "최저가", "특가", "할인코드", "쿠폰코드", "추천인코드",
  "할인링크", "구매링크", "핫딜", "타임세일",
  // 체험단 플랫폼명
  "레뷰", "리뷰노트", "태그바이", "리뷰플레이스",
];

// 연습일지 관련 키워드 (최소 1개 이상 포함 필수)
const PRACTICE_NOTE_KEYWORDS = [
  // 공통
  "연습", "레슨", "수업", "일지", "기록", "훈련", "트레이닝", "리허설",
  "피드백", "복습", "루틴", "과제", "숙제", "노트",
  // 연기
  "대본", "캐릭터 분석", "장면", "동선", "감정", "발성", "호흡",
  "즉흥", "합독", "셀프테이프", "모노로그", "감정연기",
  // 음악
  "악보", "음계", "코드", "보컬", "발성연습", "청음", "박자",
  "테크닉", "곡 연습", "합주",
  // 무용
  "안무", "스트레칭", "턴", "동작", "바", "센터", "플로어",
  "루틴", "테크닉", "컨디셔닝",
  // 미술
  "스케치", "드로잉", "크로키", "색감", "구도", "습작", "데생",
  // 영화
  "촬영일지", "편집", "콘티", "씬", "리딩", "현장",
  // 문학
  "집필", "퇴고", "초고", "원고", "창작",
];

const MIN_TRAINING_CONTENT_LENGTH = 500;

function isTrainingContentValid(title, content) {
  const fullText = `${title || ""} ${content || ""}`;

  // 1) 최소 길이
  if ((content || "").length < MIN_TRAINING_CONTENT_LENGTH) return false;

  // 2) 광고 키워드 하드 리젝
  for (const kw of AD_REJECT_KEYWORDS) {
    if (fullText.includes(kw)) return false;
  }

  // 3) 연습일지 키워드 최소 1개 포함
  const hasRelevantKeyword = PRACTICE_NOTE_KEYWORDS.some((kw) => fullText.includes(kw));
  if (!hasRelevantKeyword) return false;

  return true;
}

// --- Utility ---

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanText(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

// --- Training Data DB Operations ---

async function upsertRawTraining(items) {
  if (!supabase) throw new Error("Supabase not configured");
  if (!items || items.length === 0) return { new: 0, total: 0 };

  let newCount = 0;
  for (const item of items) {
    const record = {
      source: item.source,
      source_url: item.source_url,
      field: item.field || classifyField(`${item.title || ""} ${item.content || ""}`),
      title: item.title || null,
      content: item.content,
      processed: false,
    };

    const { error } = await supabase
      .from("raw_training_content")
      .upsert(record, { onConflict: "source_url", ignoreDuplicates: true });

    if (error) {
      console.error(`Upsert raw_training error for ${item.source_url}:`, error.message);
    } else {
      newCount++;
    }
  }

  return { new: newCount, total: items.length };
}

// --- Expire Past-Deadline Postings ---

async function expireOldPostings() {
  if (!supabase) return 0;
  const today = new Date().toISOString().split("T")[0];
  const { data, error } = await supabase
    .from("postings")
    .update({ status: "inactive" })
    .eq("status", "active")
    .lt("deadline", today)
    .not("deadline", "is", null)
    .select("id");
  if (error) {
    console.error("[expire] Error:", error.message);
    return 0;
  }
  return data ? data.length : 0;
}

module.exports = {
  fetchHTML,
  upsertPostings,
  upsertRawTraining,
  logCrawl,
  expireOldPostings,
  classifyField,
  classifyTab,
  extractRequirements,
  isTrainingContentValid,
  delay,
  randomDelay,
  cleanText,
  FIELD_KEYWORDS,
};
