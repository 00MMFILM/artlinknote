const { fetchHTML, classifyField, cleanText, randomDelay, isTrainingContentValid } = require("../crawlerBase");

const SOURCE = "tistory";
const MAX_PER_QUERY = 2;

const SEARCH_QUERIES = {
  acting: ["연기 연습일지", "연기 수업 후기", "셀프테이프 연습"],
  music: ["음악 연습일지", "보컬 레슨 후기", "악기 연습 기록"],
  dance: ["무용 연습일지", "댄스 연습 기록", "발레 레슨 후기"],
  art: ["미술 작업일지", "그림 연습 기록", "드로잉 일지"],
  film: ["영화 촬영일지", "영상 제작 일지", "단편영화 제작기"],
  literature: ["글쓰기 연습", "소설 집필 일지", "창작 노트"],
};

async function crawl({ fields, timeBudget = 15000 } = {}) {
  const targetFields = fields || Object.keys(SEARCH_QUERIES);
  const results = [];
  const seen = new Set();
  const startTime = Date.now();

  for (const field of targetFields) {
    const queries = SEARCH_QUERIES[field];
    if (!queries) continue;

    for (const query of queries) {
      if (Date.now() - startTime > timeBudget) break;

      try {
        const searchUrl = `https://www.tistory.com/search?keyword=${encodeURIComponent(query)}`;
        const $ = await fetchHTML(searchUrl, { skipCache: true });

        const links = [];
        $("a.link_post, a[href*='.tistory.com/']").each((i, el) => {
          if (links.length >= MAX_PER_QUERY) return false;
          const href = $(el).attr("href") || "";
          if (href.includes("tistory.com/") && !href.includes("/search") && !seen.has(href)) {
            const fullUrl = href.startsWith("http") ? href : `https:${href}`;
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
              detail$(".entry-title, .title_post, .tit_post, h1.title, article h1, .article-header h1").first().text()
              || detail$("meta[property='og:title']").attr("content")
            );
            const content = cleanText(
              detail$(".entry-content, .article-view, .tt_article_useless_p_margin, .contents_style, #article-view, .post-content").first().text()
            );

            if (!isTrainingContentValid(title, content)) continue;

            results.push({
              source: SOURCE,
              source_url: link,
              field: classifyField(`${title} ${content}`) || field,
              title: title || query,
              content: content.slice(0, 5000),
            });
          } catch (err) {
            console.error(`[${SOURCE}] Detail fetch failed: ${link}`, err.message);
          }
        }

        await randomDelay(500, 1000);
      } catch (err) {
        console.error(`[${SOURCE}] Search failed for "${query}":`, err.message);
      }
    }
  }

  console.log(`[${SOURCE}] Collected ${results.length} items in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  return results;
}

module.exports = { crawl, SOURCE };
