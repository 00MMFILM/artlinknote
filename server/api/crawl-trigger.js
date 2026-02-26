const { ALL_CRAWLERS } = require("../lib/crawlers");
const { upsertPostings, logCrawl } = require("../lib/crawlerBase");

// Vercel Hobby has 60s timeout. Run a subset of crawlers per invocation.
// Cron runs 2x/day, so we rotate batches: even hours = batch A, odd hours = batch B
function getBatch() {
  const hour = new Date().getUTCHours();
  const mid = Math.ceil(ALL_CRAWLERS.length / 2);
  // Batch A (first half): runs at 21:00 UTC (06:00 KST)
  // Batch B (second half): runs at 09:00 UTC (18:00 KST)
  if (hour < 12) {
    return ALL_CRAWLERS.slice(mid); // Batch B
  }
  return ALL_CRAWLERS.slice(0, mid); // Batch A
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

  // Support ?source=filmmakers to run a single crawler
  const singleSource = (req.query && req.query.source) || null;
  // Support ?all=true to attempt all (may timeout)
  const runAll = (req.query && req.query.all) === "true";

  let crawlers;
  if (singleSource) {
    const found = ALL_CRAWLERS.find((c) => c.SOURCE === singleSource);
    if (!found) return res.status(400).json({ error: `Unknown source: ${singleSource}` });
    crawlers = [found];
  } else if (runAll) {
    crawlers = ALL_CRAWLERS;
  } else {
    crawlers = getBatch();
  }

  const results = [];
  const startTime = Date.now();

  for (let i = 0; i < crawlers.length; i++) {
    const crawler = crawlers[i];
    const source = crawler.SOURCE;

    // Check remaining time (leave 5s buffer for response)
    const elapsed = Date.now() - startTime;
    if (elapsed > 50000) {
      results.push({ source, status: "skipped", reason: "timeout_approaching" });
      continue;
    }

    console.log(`[crawl] Starting ${source} (${i + 1}/${crawlers.length})...`);

    try {
      const items = await crawler.crawl();
      const { new: itemsNew, total } = await upsertPostings(items, source);

      await logCrawl(source, { itemsFound: total, itemsNew, status: "success" });
      results.push({ source, status: "success", found: total, new: itemsNew });
      console.log(`[crawl] ${source}: ${total} found, ${itemsNew} upserted`);
    } catch (err) {
      console.error(`[crawl] ${source} failed:`, err.message);
      await logCrawl(source, { status: "error", error: err.message });
      results.push({ source, status: "error", error: err.message });
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const batchLabel = singleSource ? singleSource : runAll ? "all" : `batch(${crawlers.map((c) => c.SOURCE).join(",")})`;

  return res.status(200).json({
    message: "Crawl complete",
    batch: batchLabel,
    duration: `${duration}s`,
    results,
  });
};
