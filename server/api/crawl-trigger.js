const { ALL_CRAWLERS } = require("../lib/crawlers");
const { upsertPostings, logCrawl, randomDelay } = require("../lib/crawlerBase");

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Auth: Vercel Cron sends CRON_SECRET header, or accept Bearer token
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers["authorization"] || "";
    const vercelCron = req.headers["x-vercel-cron-secret"] || "";

    if (authHeader !== `Bearer ${cronSecret}` && vercelCron !== cronSecret) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  const results = [];
  const startTime = Date.now();

  // Shuffle crawler order to avoid predictable request patterns
  const shuffled = [...ALL_CRAWLERS].sort(() => Math.random() - 0.5);

  for (let i = 0; i < shuffled.length; i++) {
    const crawler = shuffled[i];
    const source = crawler.SOURCE;
    console.log(`[crawl] Starting ${source} (${i + 1}/${shuffled.length})...`);

    try {
      const items = await crawler.crawl();
      const { new: itemsNew, total } = await upsertPostings(items, source);

      await logCrawl(source, {
        itemsFound: total,
        itemsNew,
        status: "success",
      });

      results.push({ source, status: "success", found: total, new: itemsNew });
      console.log(`[crawl] ${source}: ${total} found, ${itemsNew} upserted`);
    } catch (err) {
      console.error(`[crawl] ${source} failed:`, err.message);

      await logCrawl(source, {
        status: "error",
        error: err.message,
      });

      results.push({ source, status: "error", error: err.message });
    }

    // Random pause between crawlers (3~8s) to look like natural browsing
    if (i < shuffled.length - 1) {
      await randomDelay(3000, 8000);
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  return res.status(200).json({
    message: "Crawl complete",
    duration: `${duration}s`,
    results,
  });
};
