const { fetchHTML, classifyField, classifyTab, cleanText, randomDelay } = require("../crawlerBase");

const BASE_URL = "https://www.wevity.com";
const SOURCE = "wevity";
const MAX_ITEMS = 15;

// Art-related category pages on wevity
const CATEGORY_URLS = [
  { url: `${BASE_URL}/?c=find&s=1&gub=1`, name: "공모전" },
];

async function crawl() {
  const items = [];
  const seen = new Set();

  for (const cat of CATEGORY_URLS) {
    try {
      const $ = await fetchHTML(cat.url);

      // Wevity uses links with ix= parameter for contest entries
      $("a[href*='ix=']").each((i, el) => {
        if (items.length >= MAX_ITEMS) return false;

        const $link = $(el);
        const href = $link.attr("href") || "";
        if (!href.includes("ix=") || !href.includes("gbn=view")) return;

        const title = cleanText($link.text());
        if (!title || title.length < 5) return;

        // Build full URL
        const ixMatch = href.match(/ix=(\d+)/);
        if (!ixMatch) return;
        const ix = ixMatch[1];

        const sourceUrl = `${BASE_URL}/?c=find&s=1&gub=1&gbn=view&ix=${ix}`;
        if (seen.has(ix)) return;
        seen.add(ix);

        // Look for D-day in nearby elements
        let deadline = "";
        const $parent = $link.closest("li, div, article");
        const parentText = $parent.text();
        const dDayMatch = parentText.match(/D-(\d+)/);
        if (dDayMatch) {
          const daysLeft = parseInt(dDayMatch[1]);
          const deadlineDate = new Date();
          deadlineDate.setDate(deadlineDate.getDate() + daysLeft);
          deadline = deadlineDate.toISOString().split("T")[0];
        }

        items.push({
          title,
          source_url: sourceUrl,
          company: "",
          category: cat.name,
          description: "",
          pay: "",
          deadline,
          tags: ["공모전"],
          requirements: {},
        });
      });

      await randomDelay(1000, 2000);
    } catch (err) {
      console.error(`Wevity crawl error:`, err.message);
    }
  }

  // Classify fields
  for (const item of items) {
    item.field = classifyField(`${item.title} ${item.category}`, "art");
    item.tab = classifyTab(item.title, item.category, "");

    const tagWords = ["미술", "디자인", "사진", "영상", "음악", "문학", "웹툰", "공모전", "공예"];
    item.tags = tagWords.filter((w) => item.title.includes(w)).slice(0, 5);
    if (item.tags.length === 0) item.tags = ["공모전"];
  }

  return items;
}

module.exports = { crawl, SOURCE };
