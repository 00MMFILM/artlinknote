const { fetchHTML, classifyField, classifyTab, extractRequirements, cleanText, randomDelay } = require("../crawlerBase");

const BASE_URL = "https://www.artjob.or.kr";
const SOURCE = "artjob";
const MAX_ITEMS = 20;

// 예술인력정보 — covers all arts fields
const CATEGORY_URLS = [
  { url: `${BASE_URL}/kor/job/jobList.do?menuNo=200078`, name: "채용정보", field: "acting" },
  { url: `${BASE_URL}/kor/job/artcallList.do?menuNo=200079`, name: "공모정보", field: "art" },
];

async function crawl() {
  const allItems = [];
  const seen = new Set();

  for (const cat of CATEGORY_URLS) {
    try {
      const $ = await fetchHTML(cat.url);
      if (!$) continue;

      // artjob uses table or list-based layouts with view links
      $("a[href*='View'], a[href*='view'], a[href*='seq=']").each((i, el) => {
        if (allItems.length >= MAX_ITEMS) return false;

        const $link = $(el);
        const href = $link.attr("href") || "";
        if (!href || href === "#") return;

        const title = cleanText($link.text());
        if (!title || title.length < 5) return;

        const sourceUrl = href.startsWith("http") ? href : `${BASE_URL}${href.startsWith("/") ? "" : "/kor/job/"}${href}`;
        if (seen.has(sourceUrl)) return;
        seen.add(sourceUrl);

        // Extract metadata from parent row
        const $parent = $link.closest("tr, li, div.list-item, .board-item");
        const parentText = cleanText($parent.text());
        let deadline = "";
        const dateMatch = parentText.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/g);
        if (dateMatch) deadline = dateMatch[dateMatch.length - 1].replace(/[./]/g, "-");

        allItems.push({
          title,
          source_url: sourceUrl,
          company: "",
          category: cat.name,
          description: "",
          pay: "",
          deadline,
          tags: [cat.name, "예술일자리"],
          requirements: {},
        });
      });

      await randomDelay(2000, 4000);
    } catch (err) {
      console.error(`[artjob] Crawl error for ${cat.name}:`, err.message);
    }
  }

  for (const item of allItems.slice(0, MAX_ITEMS)) {
    try {
      const detail$ = await fetchHTML(item.source_url);
      if (!detail$) continue;
      const bodyText = cleanText(
        detail$(".view_content, .board_view, .content, article, #contents, .detail").first().text()
      );
      if (bodyText) {
        item.description = bodyText.slice(0, 2000);
        item.requirements = extractRequirements(bodyText);
      }

      const orgMatch = item.description.match(/기관[명\s]*[:.·]\s*([^\n,]+)/);
      if (orgMatch) item.company = cleanText(orgMatch[1]).slice(0, 50);

      item.field = classifyField(`${item.title} ${item.description}`, cat.field);
      item.tab = classifyTab(item.title, item.category, item.description);

      const tagWords = ["채용", "공모", "연극", "음악", "무용", "미술", "영상", "문학", "뮤지컬"];
      item.tags = tagWords.filter((w) => `${item.title} ${item.description}`.includes(w)).slice(0, 5);
      if (item.tags.length === 0) item.tags = [cat.name];

      await randomDelay(1500, 3000);
    } catch (err) {
      console.error(`[artjob] Detail fetch failed for ${item.source_url}:`, err.message);
      item.field = classifyField(item.title);
      item.tab = classifyTab(item.title, item.category, "");
    }
  }

  return allItems.slice(0, MAX_ITEMS);
}

module.exports = { crawl, SOURCE };
