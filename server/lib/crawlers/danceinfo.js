const { fetchHTML, classifyField, classifyTab, extractRequirements, cleanText, randomDelay } = require("../crawlerBase");

const BASE_URL = "https://www.dance.or.kr";
const SOURCE = "danceinfo";
const MAX_ITEMS = 15;

// 대한무용학회 / 한국무용 — dance auditions & events
const CATEGORY_URLS = [
  { url: `${BASE_URL}/bbs/board.php?bo_table=notice`, name: "공지", field: "dance" },
  { url: `${BASE_URL}/bbs/board.php?bo_table=audition`, name: "오디션", field: "dance" },
];

async function crawl() {
  const items = [];
  const seen = new Set();

  for (const cat of CATEGORY_URLS) {
    try {
      const $ = await fetchHTML(cat.url);
      if (!$) continue;

      // gnuboard pattern
      $("a[href*='wr_id=']").each((i, el) => {
        if (items.length >= MAX_ITEMS) return false;

        const $link = $(el);
        const href = $link.attr("href") || "";
        if (!href) return;

        const title = cleanText($link.text());
        if (!title || title.length < 5) return;

        const sourceUrl = href.startsWith("http") ? href : `${BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`;
        if (seen.has(sourceUrl)) return;
        seen.add(sourceUrl);

        items.push({
          title,
          source_url: sourceUrl,
          company: "",
          category: cat.name,
          field: "dance",
          description: "",
          pay: "",
          deadline: "",
          tags: ["무용", cat.name],
          requirements: {},
        });
      });

      await randomDelay(2000, 4000);
    } catch (err) {
      console.error(`[danceinfo] Crawl error for ${cat.name}:`, err.message);
    }
  }

  for (const item of items.slice(0, MAX_ITEMS)) {
    try {
      const detail$ = await fetchHTML(item.source_url);
      if (!detail$) continue;
      const bodyText = cleanText(
        detail$("#bo_v_con, .view_content, .read_body, article, #writeContents").first().text()
      );
      if (bodyText) {
        item.description = bodyText.slice(0, 2000);
        item.requirements = extractRequirements(bodyText);
      }

      const deadlineMatch = item.description.match(/마감[^0-9]*(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
      if (deadlineMatch) {
        item.deadline = `${deadlineMatch[1]}-${deadlineMatch[2].padStart(2, "0")}-${deadlineMatch[3].padStart(2, "0")}`;
      }

      item.field = classifyField(`${item.title} ${item.description}`, "dance");
      item.tab = classifyTab(item.title, item.category, item.description);

      const tagWords = ["무용", "발레", "현대무용", "한국무용", "댄스", "안무", "오디션", "공연"];
      item.tags = tagWords.filter((w) => `${item.title} ${item.description}`.includes(w)).slice(0, 5);
      if (item.tags.length === 0) item.tags = ["무용"];

      await randomDelay(1500, 3000);
    } catch (err) {
      console.error(`[danceinfo] Detail fetch failed for ${item.source_url}:`, err.message);
      item.tab = classifyTab(item.title, item.category, "");
    }
  }

  return items;
}

module.exports = { crawl, SOURCE };
