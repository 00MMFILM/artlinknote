const { fetchHTML, classifyField, cleanText, randomDelay, isTrainingContentValid } = require("../crawlerBase");

const SOURCE = "esangdance";
const BASE_URL = "https://www.esangdance.net";
const MAX_PER_BOARD = 10;

// 공개 접근 가능 보드 (로그인 불필요)
const BOARDS = [
  { path: "/B01", label: "무용뉴스" },
  { path: "/N01", label: "공연정보" },
  { path: "/B04", label: "워크숍정보" },
  { path: "/B02", label: "콩쿨게시판" },
];

async function crawl() {
  const results = [];
  const seen = new Set();

  for (const board of BOARDS) {
    try {
      const listUrl = `${BASE_URL}${board.path}`;
      const $ = await fetchHTML(listUrl, { skipCache: true });

      const links = [];
      // GnuBoard table-based board: title links inside table rows
      $("a.text-dark, a.link-secondary").each((i, el) => {
        if (links.length >= MAX_PER_BOARD) return false;
        const href = $(el).attr("href") || "";
        // Match board detail URLs: /{boardCode}/{wr_id} or /bbs/board.php?bo_table=...&wr_id=...
        if ((href.includes(board.path + "/") || href.includes("wr_id=")) && !seen.has(href)) {
          const fullUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;
          seen.add(fullUrl);
          links.push(fullUrl);
        }
      });

      for (const link of links) {
        try {
          await randomDelay(1500, 3000);
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

      await randomDelay(2000, 4000);
    } catch (err) {
      console.error(`[${SOURCE}] Board ${board.path} failed:`, err.message);
    }
  }

  console.log(`[${SOURCE}] Collected ${results.length} items`);
  return results;
}

module.exports = { crawl, SOURCE };
