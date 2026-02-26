const { fetchHTML, classifyField, classifyTab, cleanText, randomDelay } = require("../crawlerBase");

const BASE_URL = "https://www.contestkorea.com";
const SOURCE = "contestkorea";
const MAX_ITEMS = 20;

// Arts-related category codes
const CATEGORY_URLS = [
  { code: "030110001", name: "문학·문예", field: "literature" },
  { code: "030610001", name: "미술·디자인·웹툰", field: "art" },
  { code: "030910001", name: "음악·공연·댄스", field: "music" },
  { code: "031210001", name: "사진·영상·영화", field: "film" },
];

async function crawl() {
  const allItems = [];

  for (const cat of CATEGORY_URLS) {
    try {
      const url = `${BASE_URL}/sub/list.php?int_gbn=1&Txt_bcode=${cat.code}&Ession=available`;
      const $ = await fetchHTML(url);
      const items = [];

      // ContestKorea uses list items with links to view.php
      $("a[href*='view.php']").each((i, el) => {
        if (items.length >= MAX_ITEMS / CATEGORY_URLS.length) return false;

        const $link = $(el);
        const href = $link.attr("href");
        if (!href || href.includes("int_gbn=2")) return; // Skip non-contest links

        const title = cleanText($link.text());
        if (!title || title.length < 5) return;

        const sourceUrl = href.startsWith("http")
          ? href
          : href.startsWith("/")
            ? `${BASE_URL}${href}`
            : `${BASE_URL}/sub/${href}`;

        items.push({
          title,
          source_url: sourceUrl,
          company: "",
          category: cat.name,
          field: cat.field,
          description: "",
          pay: "",
          deadline: "",
          tags: [cat.name, "공모전"],
          requirements: {},
        });
      });

      // Deduplicate within category
      const seen = new Set();
      const unique = items.filter((item) => {
        if (seen.has(item.source_url)) return false;
        seen.add(item.source_url);
        return true;
      });

      // Parse metadata from surrounding text
      $("a[href*='view.php']").each((i, el) => {
        const $link = $(el);
        const $parent = $link.closest("div, li, tr");
        const parentText = cleanText($parent.text());

        const item = unique.find((u) => u.title === cleanText($link.text()));
        if (!item) return;

        // Extract organizer
        const orgMatch = parentText.match(/주최\s*[.·:]\s*([^\n|]+)/);
        if (orgMatch) item.company = cleanText(orgMatch[1]);

        // Extract deadline from D-day or date range
        const dateMatch = parentText.match(/(\d{4}[./-]\d{2}[./-]\d{2})/g);
        if (dateMatch && dateMatch.length > 0) {
          item.deadline = dateMatch[dateMatch.length - 1].replace(/[./]/g, "-");
        }

        // Extract prize
        const prizeMatch = parentText.match(/\d+만원|대상[^,]+/);
        if (prizeMatch) item.pay = prizeMatch[0];
      });

      allItems.push(...unique);
      await randomDelay(2000, 5000);
    } catch (err) {
      console.error(`ContestKorea crawl error for ${cat.name}:`, err.message);
    }
  }

  // Fetch detail pages for descriptions
  for (const item of allItems.slice(0, MAX_ITEMS)) {
    try {
      const detail$ = await fetchHTML(item.source_url);
      const bodyText = cleanText(
        detail$(".view_content, .contest_view, .board_view, article, #contents, .sub_content").first().text()
      );
      if (bodyText) {
        item.description = bodyText.slice(0, 2000);
      }
      item.field = classifyField(`${item.title} ${item.description} ${item.category}`);
      item.tab = classifyTab(item.title, item.category, item.description);
      await randomDelay(1500, 4000);
    } catch (err) {
      console.error(`Detail fetch failed for ${item.source_url}:`, err.message);
      item.tab = classifyTab(item.title, item.category, "");
    }
  }

  return allItems.slice(0, MAX_ITEMS);
}

module.exports = { crawl, SOURCE };
