const { fetchHTML, classifyField, cleanText, randomDelay, isTrainingContentValid } = require("../crawlerBase");

const SOURCE = "filmmakersCommunity";
const BASE_URL = "https://www.filmmakers.co.kr";
const MAX_PER_BOARD = 15;

// 연습일지/훈련 관련 게시판만 타겟
const BOARDS = [
  { path: "/actorsForum", label: "배우포럼" },
  { path: "/class", label: "교실/강의" },
  { path: "/class_review", label: "수업후기" },
];

async function crawl() {
  const results = [];
  const seen = new Set();

  for (const board of BOARDS) {
    try {
      const listUrl = `${BASE_URL}${board.path}`;
      const $ = await fetchHTML(listUrl, { skipCache: true });

      const links = [];
      // Rhymix table-based board skin: links matching /{boardPath}/{document_srl}
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
        try {
          await randomDelay(1500, 3000);
          const detail$ = await fetchHTML(link, { skipCache: true });

          // Rhymix detail: .xe_content for body, h1 or JSON-LD for title
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

      await randomDelay(2000, 4000);
    } catch (err) {
      console.error(`[${SOURCE}] Board ${board.path} failed:`, err.message);
    }
  }

  console.log(`[${SOURCE}] Collected ${results.length} items`);
  return results;
}

module.exports = { crawl, SOURCE };
