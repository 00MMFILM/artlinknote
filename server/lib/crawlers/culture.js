const { fetchHTML, classifyField, classifyTab, cleanText, randomDelay } = require("../crawlerBase");

const BASE_URL = "https://www.culture.go.kr";
const SOURCE = "culture";
const MAX_ITEMS = 20;

// 문화포털 — government culture ministry portal
const CATEGORY_URLS = [
  { url: `${BASE_URL}/contest/contestList.do`, name: "문화공모전", field: "art" },
  { url: `${BASE_URL}/space/spaceList.do`, name: "문화공간", field: "art" },
];

async function crawl() {
  const items = [];
  const seen = new Set();

  for (const cat of CATEGORY_URLS) {
    try {
      const $ = await fetchHTML(cat.url);
      if (!$) continue;

      $("a[href*='View'], a[href*='view'], a[href*='Detail'], a[href*='seq=']").each((i, el) => {
        if (items.length >= MAX_ITEMS) return false;

        const $link = $(el);
        const href = $link.attr("href") || "";
        if (!href || href === "#") return;

        const title = cleanText($link.text());
        if (!title || title.length < 5) return;

        const sourceUrl = href.startsWith("http") ? href : `${BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`;
        if (seen.has(sourceUrl)) return;
        seen.add(sourceUrl);

        const $parent = $link.closest("tr, li, .list-item, .board-item, div");
        const parentText = cleanText($parent.text());
        let deadline = "";
        const dateMatch = parentText.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/g);
        if (dateMatch) deadline = dateMatch[dateMatch.length - 1].replace(/[./]/g, "-");

        items.push({
          title,
          source_url: sourceUrl,
          company: "문화체육관광부",
          category: cat.name,
          description: "",
          pay: "",
          deadline,
          tags: ["문화포털", cat.name],
          requirements: {},
        });
      });

      await randomDelay(2000, 4000);
    } catch (err) {
      console.error(`[culture] Crawl error for ${cat.name}:`, err.message);
    }
  }

  for (const item of items.slice(0, MAX_ITEMS)) {
    try {
      const detail$ = await fetchHTML(item.source_url);
      if (!detail$) continue;
      const bodyText = cleanText(
        detail$(".view_content, .board_view, .content, article, #contents, .detail_content").first().text()
      );
      if (bodyText) {
        item.description = bodyText.slice(0, 2000);
      }
      item.field = classifyField(`${item.title} ${item.description}`, "art");
      item.tab = classifyTab(item.title, item.category, item.description);

      const tagWords = ["미술", "음악", "무용", "연극", "영화", "문학", "공예", "사진", "디자인"];
      item.tags = tagWords.filter((w) => `${item.title} ${item.description}`.includes(w)).slice(0, 5);
      if (item.tags.length === 0) item.tags = ["문화포털", item.category];

      await randomDelay(1500, 3000);
    } catch (err) {
      console.error(`[culture] Detail fetch failed for ${item.source_url}:`, err.message);
      item.field = classifyField(item.title, "art");
      item.tab = classifyTab(item.title, item.category, "");
    }
  }

  return items.slice(0, MAX_ITEMS);
}

module.exports = { crawl, SOURCE };
