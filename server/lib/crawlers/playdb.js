const { fetchHTML, classifyField, classifyTab, extractRequirements, cleanText, randomDelay } = require("../crawlerBase");

const BASE_URL = "https://www.playdb.co.kr";
const SOURCE = "playdb";
const MAX_ITEMS = 20;

// PlayDB categories for performing arts
const CATEGORY_URLS = [
  { url: `${BASE_URL}/magazine/magazine_list.asp?kind=2`, name: "뮤지컬", field: "music" },
  { url: `${BASE_URL}/magazine/magazine_list.asp?kind=1`, name: "연극", field: "acting" },
  { url: `${BASE_URL}/magazine/magazine_list.asp?kind=4`, name: "무용", field: "dance" },
];

async function crawl() {
  const allItems = [];
  const seen = new Set();

  for (const cat of CATEGORY_URLS) {
    try {
      const $ = await fetchHTML(cat.url);
      if (!$) continue;

      $("a[href*='magazine_detail'], a[href*='no=']").each((i, el) => {
        if (allItems.length >= MAX_ITEMS) return false;

        const $link = $(el);
        const href = $link.attr("href") || "";
        if (!href) return;

        const title = cleanText($link.text());
        if (!title || title.length < 5) return;

        const sourceUrl = href.startsWith("http") ? href : `${BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`;
        if (seen.has(sourceUrl)) return;
        seen.add(sourceUrl);

        allItems.push({
          title,
          source_url: sourceUrl,
          company: "",
          category: cat.name,
          field: cat.field,
          description: "",
          pay: "",
          deadline: "",
          tags: [cat.name, "공연"],
          requirements: {},
        });
      });

      await randomDelay(2000, 4000);
    } catch (err) {
      console.error(`[playdb] Crawl error for ${cat.name}:`, err.message);
    }
  }

  for (const item of allItems.slice(0, MAX_ITEMS)) {
    try {
      const detail$ = await fetchHTML(item.source_url);
      if (!detail$) continue;
      const bodyText = cleanText(
        detail$(".article, .content, .view_content, .magazine_content, td.text").first().text()
      );
      if (bodyText) {
        item.description = bodyText.slice(0, 2000);
        item.requirements = extractRequirements(bodyText);
      }
      item.field = classifyField(`${item.title} ${item.description}`, item.field);
      item.tab = classifyTab(item.title, item.category, item.description);
      await randomDelay(1500, 3000);
    } catch (err) {
      console.error(`[playdb] Detail fetch failed for ${item.source_url}:`, err.message);
      item.tab = classifyTab(item.title, item.category, "");
    }
  }

  return allItems.slice(0, MAX_ITEMS);
}

module.exports = { crawl, SOURCE };
