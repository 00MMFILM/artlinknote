const { fetchHTML, classifyField, classifyTab, cleanText, randomDelay } = require("../crawlerBase");

const BASE_URL = "https://www.art-culture.co.kr";
const LIST_URL = `${BASE_URL}/magazine_contest`;
const SOURCE = "artculture";
const MAX_ITEMS = 20;

async function crawl() {
  const $ = await fetchHTML(LIST_URL);
  const items = [];
  const seen = new Set();

  // art-culture.co.kr uses links to /magazine_contest/{id}
  $("a[href*='/magazine_contest/']").each((i, el) => {
    if (items.length >= MAX_ITEMS) return false;

    const $link = $(el);
    const href = $link.attr("href") || "";
    if (!href.match(/\/magazine_contest\/\d+$/)) return;

    const title = cleanText($link.text());
    if (!title || title.length < 5) return;

    const sourceUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    if (seen.has(sourceUrl)) return;
    seen.add(sourceUrl);

    items.push({
      title,
      source_url: sourceUrl,
      company: "",
      category: "공모전",
      description: "",
      pay: "",
      deadline: "",
      tags: ["공모전"],
      requirements: {},
    });
  });

  // Fetch detail pages for descriptions
  for (const item of items.slice(0, MAX_ITEMS)) {
    try {
      const detail$ = await fetchHTML(item.source_url);
      const bodyText = cleanText(
        detail$("article, .entry-content, .post-content, .contest-content, .magazine-content, .content").first().text()
      );
      if (bodyText) {
        item.description = bodyText.slice(0, 2000);
      }

      // Extract deadline
      const deadlineMatch = item.description.match(/마감[^0-9]*(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
      if (deadlineMatch) {
        item.deadline = `${deadlineMatch[1]}-${deadlineMatch[2].padStart(2, "0")}-${deadlineMatch[3].padStart(2, "0")}`;
      } else {
        const dateMatch = item.description.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/g);
        if (dateMatch && dateMatch.length > 0) {
          item.deadline = dateMatch[dateMatch.length - 1].replace(/[./]/g, "-");
        }
      }

      // Extract organizer
      const orgMatch = item.description.match(/주최\s*[:.·]\s*([^\n,]+)/);
      if (orgMatch) item.company = cleanText(orgMatch[1]).slice(0, 50);

      item.field = classifyField(`${item.title} ${item.description}`, "art");
      item.tab = classifyTab(item.title, item.category, item.description);

      const tagWords = ["미술", "사진", "디자인", "음악", "무용", "영상", "문학", "공모전", "공예"];
      item.tags = tagWords.filter((w) => `${item.title} ${item.description}`.includes(w)).slice(0, 5);
      if (item.tags.length === 0) item.tags = ["공모전"];

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
