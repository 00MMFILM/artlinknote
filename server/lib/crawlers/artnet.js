const { fetchHTML, classifyField, classifyTab, cleanText, randomDelay } = require("../crawlerBase");

const BASE_URL = "http://artnet.kr";
const LIST_URL = `${BASE_URL}/p/competition`;
const SOURCE = "artnet";
const MAX_ITEMS = 20;

async function crawl() {
  const $ = await fetchHTML(LIST_URL);
  const items = [];
  const seen = new Set();

  // artnet.kr uses post-content divs with links to /p/competition/{id}
  $("a[href*='/p/competition/']").each((i, el) => {
    if (items.length >= MAX_ITEMS) return false;

    const $link = $(el);
    const href = $link.attr("href") || "";
    if (!href || !href.match(/\/competition\/\d+$/)) return;

    // Get title from link text or title attribute
    const title = cleanText($link.attr("title") || $link.text());
    if (!title || title.length < 5) return;

    const sourceUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    if (seen.has(sourceUrl)) return;
    seen.add(sourceUrl);

    items.push({
      title,
      source_url: sourceUrl,
      company: "",
      category: "미술공모",
      description: "",
      pay: "",
      deadline: "",
      tags: ["미술", "공모전"],
      requirements: {},
    });
  });

  // Fetch detail pages for descriptions
  for (const item of items.slice(0, MAX_ITEMS)) {
    try {
      const detail$ = await fetchHTML(item.source_url);
      const bodyText = cleanText(
        detail$(".post-content, .board-view, article, .view_content, #bo_v_con").first().text()
      );
      if (bodyText) {
        item.description = bodyText.slice(0, 2000);
      }

      // Extract deadline from description
      const dateMatch = item.description.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/g);
      if (dateMatch && dateMatch.length > 0) {
        item.deadline = dateMatch[dateMatch.length - 1].replace(/[./]/g, "-");
      }

      item.field = classifyField(`${item.title} ${item.description}`, "art");
      item.tab = classifyTab(item.title, item.category, item.description);

      const tagWords = ["미술", "회화", "조각", "설치", "사진", "디자인", "공예", "공모전", "전시", "레지던시"];
      item.tags = tagWords.filter((w) => `${item.title} ${item.description}`.includes(w)).slice(0, 5);
      if (item.tags.length === 0) item.tags = ["미술", "공모전"];

      await randomDelay(1500, 3000);
    } catch (err) {
      console.error(`Detail fetch failed for ${item.source_url}:`, err.message);
      item.field = classifyField(item.title, "art");
      item.tab = classifyTab(item.title, item.category, "");
    }
  }

  return items.slice(0, MAX_ITEMS);
}

module.exports = { crawl, SOURCE };
