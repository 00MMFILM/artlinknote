const { fetchHTML, classifyField, cleanText, randomDelay, isTrainingContentValid } = require("../crawlerBase");

const SOURCE = "filmmakersCommunity";
const BASE_URL = "https://www.filmmakers.co.kr";
const MAX_PER_BOARD = 5;

const BOARDS = [
  { path: "/actorsForum", label: "배우포럼" },
  { path: "/class", label: "교실/강의" },
  { path: "/class_review", label: "수업후기" },
];

async function crawl({ timeBudget = 15000 } = {}) {
  const results = [];
  const seen = new Set();
  const startTime = Date.now();

  for (const board of BOARDS) {
    if (Date.now() - startTime > timeBudget) break;

    try {
      const listUrl = `${BASE_URL}${board.path}`;
      const $ = await fetchHTML(listUrl, { skipCache: true });

      const links = [];
      const pattern = new RegExp(`${board.path}/(\\d+)$`);
      $("a").each((i, el) => {
        if (links.length >= MAX_PER_BOARD) return false;
        const href = $(el).attr("href") || "";
        if (pattern.test(href) && !seen.has(href)) {
          seen.add(href);
          links.push(`${BASE_URL}${href}`);
        }
      });

      for (const link of links) {
        if (Date.now() - startTime > timeBudget) break;
        try {
          await randomDelay(300, 600);
          const detail$ = await fetchHTML(link, { skipCache: true });

          const title = cleanText(
            detail$("h1").first().text()
            || detail$('script[type="application/ld+json"]').text().match(/"headline":"([^"]+)"/)?.[1]
          );
          const content = cleanText(detail$(".xe_content").first().text());

          if (!isTrainingContentValid(title, content)) continue;

          results.push({
            source: SOURCE,
            source_url: link,
            field: classifyField(`${title} ${content}`) || "acting",
            title: title || board.label,
            content: content.slice(0, 5000),
          });
        } catch (err) {
          console.error(`[${SOURCE}] Detail fetch failed: ${link}`, err.message);
        }
      }

      await randomDelay(500, 1000);
    } catch (err) {
      console.error(`[${SOURCE}] Board ${board.path} failed:`, err.message);
    }
  }

  console.log(`[${SOURCE}] Collected ${results.length} items in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  return results;
}

module.exports = { crawl, SOURCE };
