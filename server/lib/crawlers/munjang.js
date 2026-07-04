const { fetchHTML, classifyField, classifyTab, cleanText, randomDelay } = require("../crawlerBase");

const BASE_URL = "https://munjang.or.kr";
const LIST_URL = `${BASE_URL}/archives/category/board/contest`;
const SOURCE = "munjang";
const MAX_ITEMS = 15;

// 문장웹진 (ARKO 문학관) — literature contests & calls
async function crawl() {
  const $ = await fetchHTML(LIST_URL);
  if (!$) return [];
  const items = [];
  const seen = new Set();

  // WordPress-based — article links
  $("a[href*='/archives/'], a[href*='contest'], a[href*='board']").each((i, el) => {
    if (items.length >= MAX_ITEMS) return false;

    const $link = $(el);
    const href = $link.attr("href") || "";
    if (!href || href === "#" || href === LIST_URL) return;
    if (!href.match(/\/archives\/\d+/) && !href.match(/\?p=\d+/)) return;

    const title = cleanText($link.text());
    if (!title || title.length < 5) return;

    const sourceUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    if (seen.has(sourceUrl)) return;
    seen.add(sourceUrl);

    items.push({
      title,
      source_url: sourceUrl,
      company: "",
      category: "문학공모",
      field: "literature",
      description: "",
      pay: "",
      deadline: "",
      tags: ["문학", "공모전"],
      requirements: {},
    });
  });

  for (const item of items.slice(0, MAX_ITEMS)) {
    try {
      const detail$ = await fetchHTML(item.source_url);
      if (!detail$) continue;
      const bodyText = cleanText(
        detail$(".entry-content, article, .post-content, .content, .board_view").first().text()
      );
      if (bodyText) {
        item.description = bodyText.slice(0, 2000);
      }

      const deadlineMatch = item.description.match(/마감[^0-9]*(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
      if (deadlineMatch) {
        item.deadline = `${deadlineMatch[1]}-${deadlineMatch[2].padStart(2, "0")}-${deadlineMatch[3].padStart(2, "0")}`;
      }

      const orgMatch = item.description.match(/주최\s*[:.·]\s*([^\n,]+)/);
      if (orgMatch) item.company = cleanText(orgMatch[1]).slice(0, 50);

      item.field = classifyField(`${item.title} ${item.description}`, "literature");
      item.tab = classifyTab(item.title, item.category, item.description);

      const tagWords = ["소설", "시", "수필", "에세이", "문학", "신인상", "등단", "문학상", "공모"];
      item.tags = tagWords.filter((w) => `${item.title} ${item.description}`.includes(w)).slice(0, 5);
      if (item.tags.length === 0) item.tags = ["문학", "공모전"];

      await randomDelay(1500, 3000);
    } catch (err) {
      console.error(`[munjang] Detail fetch failed for ${item.source_url}:`, err.message);
      item.tab = classifyTab(item.title, item.category, "");
    }
  }

  return items;
}

module.exports = { crawl, SOURCE };
