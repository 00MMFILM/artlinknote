const { fetchHTML, classifyField, classifyTab, extractRequirements, cleanText, randomDelay } = require("../crawlerBase");

const BASE_URL = "https://www.themusical.co.kr";
const LIST_URL = `${BASE_URL}/Magazine/Detail/audition`;
const SOURCE = "themusical";
const MAX_ITEMS = 15;

async function crawl() {
  const $ = await fetchHTML(LIST_URL);
  if (!$) return [];
  const items = [];
  const seen = new Set();

  // themusical.co.kr — audition listings
  $("a[href*='audition'], a[href*='Detail'], a[href*='view']").each((i, el) => {
    if (items.length >= MAX_ITEMS) return false;

    const $link = $(el);
    const href = $link.attr("href") || "";
    if (!href || href === "#") return;

    const title = cleanText($link.text());
    if (!title || title.length < 5) return;

    const sourceUrl = href.startsWith("http") ? href : `${BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`;
    if (seen.has(sourceUrl)) return;
    seen.add(sourceUrl);

    items.push({
      title,
      source_url: sourceUrl,
      company: "",
      category: "뮤지컬 오디션",
      description: "",
      pay: "",
      deadline: "",
      tags: ["뮤지컬", "오디션"],
      requirements: {},
    });
  });

  for (const item of items.slice(0, MAX_ITEMS)) {
    try {
      const detail$ = await fetchHTML(item.source_url);
      if (!detail$) continue;
      const bodyText = cleanText(
        detail$(".article-body, .view_content, .content, article, .detail_content").first().text()
      );
      if (bodyText) {
        item.description = bodyText.slice(0, 2000);
        item.requirements = extractRequirements(bodyText);
      }

      const deadlineMatch = item.description.match(/마감[^0-9]*(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
      if (deadlineMatch) {
        item.deadline = `${deadlineMatch[1]}-${deadlineMatch[2].padStart(2, "0")}-${deadlineMatch[3].padStart(2, "0")}`;
      }

      item.field = classifyField(`${item.title} ${item.description}`, "music");
      item.tab = classifyTab(item.title, item.category, item.description);
      await randomDelay(1500, 3000);
    } catch (err) {
      console.error(`[themusical] Detail fetch failed for ${item.source_url}:`, err.message);
      item.field = classifyField(item.title, "music");
      item.tab = classifyTab(item.title, item.category, "");
    }
  }

  return items;
}

module.exports = { crawl, SOURCE };
