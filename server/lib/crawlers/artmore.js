const { fetchHTML, classifyField, classifyTab, extractRequirements, cleanText, randomDelay } = require("../crawlerBase");

const BASE_URL = "https://www.artmore.kr";
const LIST_URL = `${BASE_URL}/sub/recruit/search_list.do`;
const SOURCE = "artmore";
const MAX_ITEMS = 15;

async function crawl() {
  const $ = await fetchHTML(LIST_URL);
  const items = [];

  // artmore.kr uses table rows with links to search_view.do?rec_idx=ID
  $("a[href*='search_view.do']").each((i, el) => {
    if (items.length >= MAX_ITEMS) return false;

    const $link = $(el);
    const href = $link.attr("href") || "";
    if (!href) return;

    const title = cleanText($link.text());
    if (!title || title.length < 3) return;

    const sourceUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;

    // Get metadata from parent row
    const $row = $link.closest("tr");
    let company = "";
    let pay = "";
    let deadline = "";

    if ($row.length) {
      const cells = $row.find("td");
      cells.each((j, cell) => {
        const text = cleanText($(cell).text());
        // Company is usually first cell
        if (j === 0 && !text.match(/^\d+$/) && text.length > 1) {
          company = text.slice(0, 50);
        }
        // Pay often has 원 or 시급
        if (/시급|월급|연봉|\d+원/.test(text) && !pay) {
          pay = text.slice(0, 50);
        }
        // Deadline with D- format
        const dMatch = text.match(/D-(\d+)/);
        if (dMatch) {
          // Calculate actual date from D-day
          const daysLeft = parseInt(dMatch[1]);
          const deadlineDate = new Date();
          deadlineDate.setDate(deadlineDate.getDate() + daysLeft);
          deadline = deadlineDate.toISOString().split("T")[0];
        }
        // Or explicit date
        const dateMatch = text.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (dateMatch && !deadline) deadline = dateMatch[0];
      });
    }

    items.push({
      title,
      source_url: sourceUrl,
      company,
      category: "예술채용",
      description: "",
      pay,
      deadline,
      tags: ["예술", "채용"],
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
        detail$(".view_content, .recruit-view, article, .content, .board_view, #content").first().text()
      );
      if (bodyText) {
        item.description = bodyText.slice(0, 2000);
        item.requirements = extractRequirements(bodyText);
      }
      item.field = classifyField(`${item.title} ${item.description}`);
      item.tab = classifyTab(item.title, item.category, item.description);

      const tagWords = ["공연", "전시", "미술", "음악", "무용", "연극", "영화", "채용", "인턴"];
      item.tags = tagWords.filter((w) => `${item.title} ${item.description}`.includes(w)).slice(0, 5);
      if (item.tags.length === 0) item.tags = ["예술", "채용"];

      await randomDelay(1500, 3000);
    } catch (err) {
      console.error(`Detail fetch failed for ${item.source_url}:`, err.message);
      item.field = classifyField(item.title);
      item.tab = classifyTab(item.title, item.category, "");
    }
  }

  return unique;
}

module.exports = { crawl, SOURCE };
