const { fetchHTML, classifyField, classifyTab, extractRequirements, cleanText, randomDelay } = require("../crawlerBase");

const BASE_URL = "https://mule.co.kr";
const LIST_URL = `${BASE_URL}/bbs/board.php?bo_table=audition`;
const SOURCE = "mule";
const MAX_ITEMS = 20;

async function crawl() {
  const $ = await fetchHTML(LIST_URL);
  if (!$) return [];
  const items = [];
  const seen = new Set();

  // mule.co.kr uses gnuboard — links to wr_id= detail pages
  $("a[href*='wr_id='], a[href*='audition/']").each((i, el) => {
    if (items.length >= MAX_ITEMS) return false;

    const $link = $(el);
    const href = $link.attr("href") || "";
    if (!href.includes("wr_id=") && !href.match(/audition\/\d+/)) return;

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
        detail$("#bo_v_con, .view_content, .read_body, article, #writeContents").first().text()
      );
      if (bodyText) {
        item.description = bodyText.slice(0, 2000);
        item.requirements = extractRequirements(bodyText);
      }
      item.field = classifyField(`${item.title} ${item.description}`, "music");
      item.tab = classifyTab(item.title, item.category, item.description);

      const tagWords = ["뮤지컬", "오디션", "캐스팅", "앙상블", "배우", "가수", "공연"];
      item.tags = tagWords.filter((w) => `${item.title} ${item.description}`.includes(w)).slice(0, 5);
      if (item.tags.length === 0) item.tags = ["뮤지컬", "오디션"];

      await randomDelay(1500, 3000);
    } catch (err) {
      console.error(`[mule] Detail fetch failed for ${item.source_url}:`, err.message);
      item.field = classifyField(item.title, "music");
      item.tab = classifyTab(item.title, item.category, "");
    }
  }

  return items.slice(0, MAX_ITEMS);
}

module.exports = { crawl, SOURCE };
