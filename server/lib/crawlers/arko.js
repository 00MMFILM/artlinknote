const { fetchHTML, classifyField, classifyTab, cleanText, randomDelay } = require("../crawlerBase");

const BASE_URL = "https://www.arko.or.kr";
const SOURCE = "arko";
const MAX_ITEMS = 20;

// 한국문화예술위원회 — arts council grants & contests
const CATEGORY_URLS = [
  { url: `${BASE_URL}/biz/bizNotice/list.do`, name: "지원사업공고", field: "art" },
];

async function crawl() {
  const items = [];
  const seen = new Set();

  for (const cat of CATEGORY_URLS) {
    try {
      const $ = await fetchHTML(cat.url);
      if (!$) continue;

      $("a[href*='view.do'], a[href*='Detail'], a[href*='seq=']").each((i, el) => {
        if (items.length >= MAX_ITEMS) return false;

        const $link = $(el);
        const href = $link.attr("href") || "";
        if (!href || href === "#") return;

        const title = cleanText($link.text());
        if (!title || title.length < 5) return;

        const sourceUrl = href.startsWith("http") ? href : `${BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`;
        if (seen.has(sourceUrl)) return;
        seen.add(sourceUrl);

        const $parent = $link.closest("tr, li, .board-item");
        const parentText = cleanText($parent.text());
        let deadline = "";
        const dateMatch = parentText.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/g);
        if (dateMatch) deadline = dateMatch[dateMatch.length - 1].replace(/[./]/g, "-");

        let company = "한국문화예술위원회";

        items.push({
          title,
          source_url: sourceUrl,
          company,
          category: cat.name,
          description: "",
          pay: "",
          deadline,
          tags: ["예술지원", "ARKO"],
          requirements: {},
        });
      });

      await randomDelay(2000, 4000);
    } catch (err) {
      console.error(`[arko] Crawl error for ${cat.name}:`, err.message);
    }
  }

  for (const item of items.slice(0, MAX_ITEMS)) {
    try {
      const detail$ = await fetchHTML(item.source_url);
      if (!detail$) continue;
      const bodyText = cleanText(
        detail$(".view_content, .board_view, .content, article, #contents, .biz_view").first().text()
      );
      if (bodyText) {
        item.description = bodyText.slice(0, 2000);
      }
      item.field = classifyField(`${item.title} ${item.description}`, "art");
      item.tab = classifyTab(item.title, item.category, item.description);

      const tagWords = ["문학", "시각예술", "음악", "무용", "연극", "뮤지컬", "영화", "공예", "다원예술"];
      item.tags = tagWords.filter((w) => `${item.title} ${item.description}`.includes(w)).slice(0, 5);
      if (item.tags.length === 0) item.tags = ["예술지원", "ARKO"];

      await randomDelay(1500, 3000);
    } catch (err) {
      console.error(`[arko] Detail fetch failed for ${item.source_url}:`, err.message);
      item.field = classifyField(item.title, "art");
      item.tab = classifyTab(item.title, item.category, "");
    }
  }

  return items.slice(0, MAX_ITEMS);
}

module.exports = { crawl, SOURCE };
