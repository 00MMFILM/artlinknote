const naverBlog = require("../lib/crawlers/naverBlog");
const brunch = require("../lib/crawlers/brunch");
const tistory = require("../lib/crawlers/tistory");
const filmmakersCommunity = require("../lib/crawlers/filmmakersCommunity");
const grounz = require("../lib/crawlers/grounz");
const esangdance = require("../lib/crawlers/esangdance");
const { upsertRawTraining, logCrawl } = require("../lib/crawlerBase");

// 6개 크롤러를 3개씩 2배치로 분할 (각 배치 60초 내 완료)
// Batch A: 블로그 검색 (네트워크 많음) — 03:00 UTC
// Batch B: 커뮤니티 사이트 (가벼움) — 15:00 UTC
const BATCH_A = { naverBlog, brunch, tistory };
const BATCH_B = { filmmakersCommunity, grounz, esangdance };

function getBatch() {
  const hour = new Date().getUTCHours();
  // 03:00 UTC (12:00 KST) → Batch A
  // 15:00 UTC (00:00 KST) → Batch B
  if (hour < 12) {
    return { name: "A", crawlers: BATCH_A };
  }
  return { name: "B", crawlers: BATCH_B };
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

  // ?source=naverBlog (단일 크롤러 지정)
  // ?field=acting,music (분야 필터)
  // ?all=true (전체 실행, 타임아웃 주의)
  const singleSource = (req.query && req.query.source) || null;
  const runAll = (req.query && req.query.all) === "true";
  const fieldsParam = (req.query && req.query.field) || null;
  const fields = fieldsParam ? fieldsParam.split(",") : undefined;

  const allCrawlers = { ...BATCH_A, ...BATCH_B };
  let crawlerEntries;
  let batchLabel;

  if (singleSource) {
    const crawler = allCrawlers[singleSource];
    if (!crawler) {
      return res.status(400).json({
        error: `Unknown source: ${singleSource}. Valid: ${Object.keys(allCrawlers).join(", ")}`,
      });
    }
    crawlerEntries = [[singleSource, crawler]];
    batchLabel = singleSource;
  } else if (runAll) {
    crawlerEntries = Object.entries(allCrawlers);
    batchLabel = "all";
  } else {
    const batch = getBatch();
    crawlerEntries = Object.entries(batch.crawlers);
    batchLabel = `batch_${batch.name}(${crawlerEntries.map(([n]) => n).join(",")})`;
  }

  const results = [];
  const startTime = Date.now();

  for (const [name, crawler] of crawlerEntries) {
    // Check remaining time (leave 8s buffer)
    if (Date.now() - startTime > 50000) {
      results.push({ source: name, status: "skipped", reason: "timeout_approaching" });
      continue;
    }

    console.log(`[training-crawl] Starting ${name}...`);

    try {
      const items = await crawler.crawl({ fields });
      const { new: itemsNew, total } = await upsertRawTraining(items);

      await logCrawl(`training_${name}`, { itemsFound: total, itemsNew, status: "success" });
      results.push({ source: name, status: "success", found: total, new: itemsNew });
      console.log(`[training-crawl] ${name}: ${total} found, ${itemsNew} upserted`);
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
    duration: `${duration}s`,
    results,
  });
};
