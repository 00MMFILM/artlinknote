const { fetchHTML, classifyField, classifyTab, extractRequirements, cleanText, randomDelay } = require("../crawlerBase");

const BASE_URL = "https://www.castingdb.co.kr";
const LIST_URL = `${BASE_URL}/casting/casting.asp`;
const SOURCE = "castingdb";
const MAX_ITEMS = 20;

async function crawl() {
  const $ = await fetchHTML(LIST_URL);
  if (!$) return [];
  const items = [];
  const seen = new Set();

  // CastingDB — casting/audition listings
  $("a[href*='casting_view'], a[href*='idx='], a[href*='view.asp']").each((i, el) => {
    if (items.length >= MAX_ITEMS) return false;

    const $link = $(el);
    const href = $link.attr("href") || "";
    if (!href || href === "#") return;

    const title = cleanText($link.attr("title") || $link.text());
    if (!title || title.length < 3) return;

    const sourceUrl = href.startsWith("http") ? href : `${BASE_URL}${href.startsWith("/") ? "" : "/casting/"}${href}`;
    if (seen.has(sourceUrl)) return;
    seen.add(sourceUrl);

    // Extract category from bracket prefix
    const catMatch = title.match(/\[([^\]]+)\]/);
    const category = catMatch ? catMatch[1] : "캐스팅";

    const $parent = $link.closest("tr, li, div");
    const parentText = cleanText($parent.text());
    let deadline = "";
    const dateMatch = parentText.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/g);
    if (dateMatch) deadline = dateMatch[dateMatch.length - 1].replace(/[./]/g, "-");

    items.push({
      title: title.replace(/\[[^\]]+\]\s*/, ""),
      source_url: sourceUrl,
      company: "",
      category,
      description: "",
      pay: "",
      deadline,
      tags: [category, "캐스팅"].filter(Boolean),
      requirements: {},
    });
  });

  for (const item of items.slice(0, MAX_ITEMS)) {
    try {
      const detail$ = await fetchHTML(item.source_url);
      if (!detail$) continue;
      const bodyText = cleanText(
        detail$(".view_content, .casting_view, .content, article, td.text, .detail_content").first().text()
      );
      if (bodyText) {
        item.description = bodyText.slice(0, 2000);
        item.requirements = extractRequirements(bodyText);
      }
      item.field = classifyField(`${item.title} ${item.description}`);
      item.tab = classifyTab(item.title, item.category, item.description);

      const tagWords = ["캐스팅", "오디션", "영화", "드라마", "광고", "뮤지컬", "연극", "모델", "뮤직비디오"];
      item.tags = tagWords.filter((w) => `${item.title} ${item.description}`.includes(w)).slice(0, 5);
      if (item.tags.length === 0) item.tags = ["캐스팅"];

      await randomDelay(1500, 3000);
    } catch (err) {
      console.error(`[castingdb] Detail fetch failed for ${item.source_url}:`, err.message);
      item.field = classifyField(item.title);
      item.tab = classifyTab(item.title, item.category, "");
    }
  }

  return items;
}

module.exports = { crawl, SOURCE };
