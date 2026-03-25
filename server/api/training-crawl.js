const searchBlog = require("../lib/crawlers/searchBlog");
const filmmakersCommunity = require("../lib/crawlers/filmmakersCommunity");
const grounz = require("../lib/crawlers/grounz");
const { upsertRawTraining, logCrawl } = require("../lib/crawlerBase");

// 네이버 API 블로그 크롤러: 1개 분야, ~25초
// 커뮤니티 크롤러 2개: 분야 구분 없이 수집, ~30초
// (esangdance 제거 — 사이트 로그인 필수로 변경되어 크롤링 불가)
const ALL_CRAWLERS = { searchBlog, filmmakersCommunity, grounz };

const FIELDS = ["acting", "music", "dance", "art", "film", "literature"];

// 시간대별 분야 자동 순환 (하루 6회 호출 시 각각 다른 분야, 매일 6분야 전부 커버)
function getCurrentField() {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const slot = Math.floor(new Date().getUTCHours() / 4); // 0~5 (4시간 단위)
  return FIELDS[(dayOfYear * 6 + slot) % FIELDS.length];
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST" && req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  // Auth
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers["authorization"] || "";
    const vercelCron = req.headers["x-vercel-cron-secret"] || "";
    if (authHeader !== `Bearer ${cronSecret}` && vercelCron !== cronSecret) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  const singleSource = (req.query && req.query.source) || null;
  const fieldParam = (req.query && req.query.field) || null;
  const mode = (req.query && req.query.mode) || null;

  const results = [];
  const startTime = Date.now();
  const todayField = fieldParam || getCurrentField();

  let crawlerEntries;
  let batchLabel;

  if (singleSource) {
    const crawler = ALL_CRAWLERS[singleSource];
    if (!crawler) {
      return res.status(400).json({
        error: `Unknown source: ${singleSource}. Valid: ${Object.keys(ALL_CRAWLERS).join(", ")}`,
      });
    }
    crawlerEntries = [[singleSource, crawler]];
    batchLabel = singleSource;
  } else if (mode === "community") {
    crawlerEntries = [["filmmakersCommunity", filmmakersCommunity], ["grounz", grounz]];
    batchLabel = "community";
  } else if (mode === "blog") {
    crawlerEntries = [["searchBlog", searchBlog]];
    batchLabel = "blog";
  } else {
    // 기본 (cron): 블로그 검색 (1개 분야)
    crawlerEntries = [["searchBlog", searchBlog]];
    batchLabel = "blog";
  }

  for (const [name, crawler] of crawlerEntries) {
    if (Date.now() - startTime > 50000) {
      results.push({ source: name, status: "skipped", reason: "timeout_approaching" });
      continue;
    }

    const remaining = 50000 - (Date.now() - startTime);
    const isBlog = name === "searchBlog";
    const perSourceBudget = isBlog ? Math.min(remaining, 45000) : Math.min(remaining, 15000);

    try {
      const crawlArgs = { timeBudget: perSourceBudget };
      if (isBlog) crawlArgs.fields = [todayField];

      const items = await crawler.crawl(crawlArgs);
      const { new: itemsNew, total } = await upsertRawTraining(items);

      await logCrawl(`training_${name}`, { itemsFound: total, itemsNew, status: "success" });
      results.push({ source: name, status: "success", found: total, new: itemsNew });
    } catch (err) {
      console.error(`[training-crawl] ${name} failed:`, err.message);
      await logCrawl(`training_${name}`, { status: "error", error: err.message });
      results.push({ source: name, status: "error", error: err.message });
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  return res.status(200).json({
    message: "Training crawl complete",
    batch: batchLabel,
    field: todayField,
    duration: `${duration}s`,
    results,
  });
};
