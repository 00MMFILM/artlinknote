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

// --- Utility ---

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanText(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

module.exports = {
  fetchHTML,
  upsertPostings,
  logCrawl,
  classifyField,
  classifyTab,
  extractRequirements,
  delay,
  randomDelay,
  cleanText,
  FIELD_KEYWORDS,
};
