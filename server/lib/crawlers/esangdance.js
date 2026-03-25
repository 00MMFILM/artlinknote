const { fetchHTML, classifyField, cleanText, randomDelay, isTrainingContentValid } = require("../crawlerBase");

const SOURCE = "esangdance";
const BASE_URL = "https://www.esangdance.net";
const MAX_PER_BOARD = 4;

const BOARDS = [
  { path: "/B01", label: "무용뉴스" },
  { path: "/N01", label: "공연정보" },
  { path: "/B04", label: "워크숍정보" },
  { path: "/B02", label: "콩쿨게시판" },
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
      $("a.text-dark, a.link-secondary").each((i, el) => {
        if (links.length >= MAX_PER_BOARD) return false;
        const href = $(el).attr("href") || "";
        if ((href.includes(board.path + "/") || href.includes("wr_id=")) && !seen.has(href)) {
          const fullUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;
          seen.add(fullUrl);
          links.push(fullUrl);
        }
      });

      for (const link of links) {
        if (Date.now() - startTime > timeBudget) break;
        try {
          await randomDelay(300, 600);
          const detail$ = await fetchHTML(link, { skipCache: true });

          const title = cleanText(
            detail$("blockquote h4, h4.bo_v_tit, #bo_v_title").first().text()
          );
          const content = cleanText(detail$("#bo_v_con").first().text());

          if (!isTrainingContentValid(title, content)) continue;

          results.push({
            source: SOURCE,
            source_url: link,
            field: classifyField(`${title} ${content}`) || "dance",
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
