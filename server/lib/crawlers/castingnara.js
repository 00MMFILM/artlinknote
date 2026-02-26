const { fetchHTML, classifyField, classifyTab, extractRequirements, cleanText, randomDelay } = require("../crawlerBase");

const BASE_URL = "https://castingnara.com";
const LIST_URL = `${BASE_URL}/guin_list.php`;
const SOURCE = "castingnara";
const MAX_ITEMS = 20;

async function crawl() {
  // First hit the main page to warm up session/cookies, then fetch list
  try { await fetchHTML(BASE_URL, { skipCache: true }); } catch (_) {}
  await randomDelay(500, 1500);

  const $ = await fetchHTML(LIST_URL, { skipCache: true });
  const items = [];

  // castingnara.com uses guin_detail.php?num=... for individual posts
  $("a[href*='guin_detail.php']").each((i, el) => {
    if (items.length >= MAX_ITEMS) return false;

    const $link = $(el);
    const href = $link.attr("href") || "";
    if (!href) return;

    const title = cleanText($link.text());
    if (!title || title.length < 5) return;

    // Normalize URL
    const sourceUrl = href.startsWith("http")
      ? href
      : href.startsWith("./")
        ? `${BASE_URL}/${href.slice(2)}`
        : `${BASE_URL}/${href}`;

    // Remove PHPSESSID from URL for stable dedup
    const cleanUrl = sourceUrl.replace(/&?PHPSESSID=[^&]+/, "").replace(/\?&/, "?");

    items.push({
      title,
      source_url: cleanUrl,
      company: "",
      category: "캐스팅",
      description: "",
      pay: "",
      deadline: "",
      tags: ["캐스팅"],
      requirements: {},
    });
  });

  // Deduplicate by source_url
  const seen = new Set();
  const unique = items.filter((item) => {
    if (seen.has(item.source_url)) return false;
    seen.add(item.source_url);
    return true;
  });

  // Fetch detail pages
  for (const item of unique.slice(0, MAX_ITEMS)) {
    try {
      const detail$ = await fetchHTML(item.source_url);
      const bodyText = cleanText(
        detail$(".view-content, .guin_detail, .detail_content, td, .content, article").first().text()
      );
      if (bodyText) {
        item.description = bodyText.slice(0, 2000);
        item.requirements = extractRequirements(bodyText);
      }
      item.field = classifyField(`${item.title} ${item.description}`);
      item.tab = classifyTab(item.title, item.category, item.description);

      const tagWords = ["캐스팅", "오디션", "영화", "드라마", "광고", "뮤직비디오", "모델", "BJ"];
      item.tags = tagWords.filter((w) => `${item.title} ${item.description}`.includes(w)).slice(0, 5);
      if (item.tags.length === 0) item.tags = ["캐스팅"];

      await randomDelay(1500, 4000);
    } catch (err) {
      console.error(`Detail fetch failed for ${item.source_url}:`, err.message);
      item.field = classifyField(item.title);
      item.tab = classifyTab(item.title, item.category, "");
    }
  }

  return unique.slice(0, MAX_ITEMS);
}

module.exports = { crawl, SOURCE };
