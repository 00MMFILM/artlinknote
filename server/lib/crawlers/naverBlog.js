const { fetchHTML, classifyField, cleanText, randomDelay, isTrainingContentValid } = require("../crawlerBase");

const SOURCE = "naverBlog";
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
        const searchUrl = `https://m.search.naver.com/search.naver?where=m_blog&query=${encodeURIComponent(query)}`;
        const $ = await fetchHTML(searchUrl, { skipCache: true });

        const links = [];
        $("a.api_txt_lines, a.title_link, a.sub_txt, a[href*='blog.naver.com']").each((i, el) => {
          if (links.length >= MAX_PER_QUERY) return false;
          const href = $(el).attr("href") || "";
          if (href.includes("blog.naver.com") && !seen.has(href)) {
            seen.add(href);
            links.push(href);
          }
        });

        for (const link of links) {
          if (Date.now() - startTime > timeBudget) break;
          try {
            await randomDelay(300, 600);
            const mobileUrl = link.replace("blog.naver.com", "m.blog.naver.com");
            const detail$ = await fetchHTML(mobileUrl, { skipCache: true });

            const title = cleanText(detail$(".se-title-text, .pcol1, h3.se_textarea, .tit_h3").first().text());
            const content = cleanText(
              detail$(".se-main-container, .post-view, #postViewArea, .se_component_wrap").first().text()
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
