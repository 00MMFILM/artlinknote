const { fetchHTML, classifyField, classifyTab, extractRequirements, cleanText, randomDelay } = require("../crawlerBase");

const BASE_URL = "https://otr.co.kr";
const LIST_URL = `${BASE_URL}/audition/`;
const SOURCE = "otr";
const MAX_ITEMS = 20;

// Categories to skip (notices, etc.)
const SKIP_CATEGORIES = ["공지사항"];

async function crawl() {
  const $ = await fetchHTML(LIST_URL);
  const items = [];

  // OTR uses mangboard (WordPress plugin) with table-based listing
  // Links are full URLs like https://otr.co.kr/audition/?vid=12345
  $("a[href*='vid=']").each((i, el) => {
    if (items.length >= MAX_ITEMS) return false;

    const $link = $(el);
    const href = $link.attr("href") || "";
    if (!href) return;

    // Get title from title attribute (more reliable) or text
    const title = cleanText($link.attr("title") || $link.text());
    if (!title || title.length < 3) return;

    // Extract category from bracket prefix: [연극], [뮤지컬], etc.
    const catMatch = title.match(/\[([^\]]+)\]/);
    const category = catMatch ? catMatch[1] : "";

    // Skip notices
    if (SKIP_CATEGORIES.includes(category)) return;

    const sourceUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;

    // Extract metadata from parent row
    const $row = $link.closest("tr");
    let pay = "";
    let deadline = "";

    if ($row.length) {
      $row.find("td").each((j, cell) => {
        const text = cleanText($(cell).text());
        if (/\d+만원|협의/.test(text) && !pay) pay = text;
        const dateMatch = text.match(/\d{4}-\d{2}-\d{2}/);
        if (dateMatch && !deadline) deadline = dateMatch[0];
      });
    }

    items.push({
      title: title.replace(/\[[^\]]+\]\s*/, ""),
      source_url: sourceUrl,
      company: "",
      category: category || "오디션",
      pay,
      deadline,
      description: "",
      tags: [category, "오디션"].filter(Boolean),
      requirements: {},
    });
  });

  // Deduplicate
  const seen = new Set();
  const unique = items.filter((item) => {
    if (seen.has(item.source_url)) return false;
    seen.add(item.source_url);
    return true;
  });

  // Fetch detail pages
  for (const item of unique) {
    try {
      const detail$ = await fetchHTML(item.source_url);
      const bodyText = cleanText(
        detail$(".view_content, .read_body, article, .board_view, #bo_v_con, .entry-content").first().text()
      );
      if (bodyText) {
        item.description = bodyText.slice(0, 2000);
        item.requirements = extractRequirements(bodyText);
      }
      item.field = classifyField(`${item.title} ${item.description}`);
      item.tab = classifyTab(item.title, item.category, item.description);
      await randomDelay(1500, 4000);
    } catch (err) {
      console.error(`Detail fetch failed for ${item.source_url}:`, err.message);
      item.field = classifyField(item.title);
      item.tab = classifyTab(item.title, item.category, "");
    }
  }

  return unique;
}

module.exports = { crawl, SOURCE };
