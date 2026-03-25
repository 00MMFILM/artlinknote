const { classifyField, cleanText, randomDelay, isTrainingContentValid } = require("../crawlerBase");
const cheerio = require("cheerio");

const SOURCE = "grounz";
const API_BASE = "https://api.grounz.net";
const SITE_BASE = "https://grounz.net";
const MAX_ITEMS = 8;

// 자유게시판(1), 질문답변(2), 정보게시판(5), 실용음악과(21)
const CATEGORY_IDS = [1, 2, 5, 21];

async function fetchAPI(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
      "Referer": "https://grounz.net/",
    },
  });
  if (!res.ok) throw new Error(`API ${res.status} for ${path}`);
  return res.json();
}

function htmlToText(html) {
  if (!html) return "";
  const $ = cheerio.load(html);
  return cleanText($.text());
}

async function crawl({ timeBudget = 15000 } = {}) {
  const results = [];
  const seen = new Set();
  const startTime = Date.now();

  for (const categoryId of CATEGORY_IDS) {
    if (Date.now() - startTime > timeBudget) break;

    try {
      const data = await fetchAPI(`/community/articles?page=1&size=${MAX_ITEMS}&categoryId=${categoryId}`);
      const rows = data.rows || [];

      for (const row of rows) {
        if (Date.now() - startTime > timeBudget) break;

        const postId = row.id;
        const sourceUrl = `${SITE_BASE}/community/view/${postId}`;
        if (seen.has(sourceUrl)) continue;
        seen.add(sourceUrl);

        try {
          await randomDelay(300, 600);
          const detail = await fetchAPI(`/community/articles/${postId}`);

          const title = detail.article?.title || "";
          const bodyHtml = detail.article?.body || "";
          const content = htmlToText(bodyHtml);

          if (!isTrainingContentValid(title, content)) continue;

          results.push({
            source: SOURCE,
            source_url: sourceUrl,
            field: classifyField(`${title} ${content}`) || "music",
            title: title,
            content: content.slice(0, 5000),
          });
        } catch (err) {
          console.error(`[${SOURCE}] Detail fetch failed: ${sourceUrl}`, err.message);
        }
      }

      await randomDelay(500, 1000);
    } catch (err) {
      console.error(`[${SOURCE}] Category ${categoryId} failed:`, err.message);
    }
  }

  console.log(`[${SOURCE}] Collected ${results.length} items in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  return results;
}

module.exports = { crawl, SOURCE };
