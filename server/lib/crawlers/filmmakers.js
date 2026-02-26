const { fetchHTML, classifyField, classifyTab, extractRequirements, cleanText, randomDelay } = require("../crawlerBase");

const BASE_URL = "https://www.filmmakers.co.kr";
const LIST_URL = `${BASE_URL}/actorCasting`;
const SOURCE = "filmmakers";
const MAX_ITEMS = 20;

async function crawl() {
  const $ = await fetchHTML(LIST_URL);
  const items = [];

  // Modern div-based layout: each post is an <a> linking to /actorCasting/{id}
  // inside a div.flex-1.min-w-0.p-3 (actual posts, not notices)
  $("a").each((i, el) => {
    if (items.length >= MAX_ITEMS) return false;

    const $link = $(el);
    const href = $link.attr("href") || "";

    // Only match actual post IDs (numeric), skip categories/signup/notices
    if (!/\/actorCasting\/\d+$/.test(href)) return;

    // Skip notice posts (parent has px-3 overflow-hidden)
    const parentClass = $link.parent().attr("class") || "";
    if (parentClass.includes("overflow-hidden")) return;

    const rawText = cleanText($link.text());
    if (!rawText) return;

    const sourceUrl = `${BASE_URL}${href}`;

    // Parse: "카테고리  N  실제 제목" — category is first word(s), N is new badge
    // Example: "단편영화 N 저예산 단편영화 굿나잇 조연 모집합니다"
    const categoryPatterns = [
      "장편 상업영화", "장편 독립영화", "OTT/TV 드라마",
      "단편영화", "웹드라마", "뮤직비디오", "연극/뮤지컬", "기타",
    ];
    let category = "영화";
    let title = rawText;

    for (const cat of categoryPatterns) {
      if (rawText.startsWith(cat)) {
        category = cat;
        title = rawText.slice(cat.length).replace(/^\s*(오늘마감\s*)?(\+D\s*\d+\s*)?N?\s*/, "").trim();
        break;
      }
    }

    if (!title || title.length < 3) return;

    // Extract date from sibling div
    const $row = $link.closest("div.flex");
    const dateDiv = $row.find("div.hidden").text();
    let deadline = "";
    const dateMatch = dateDiv.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) deadline = dateMatch[1];

    items.push({
      title,
      source_url: sourceUrl,
      company: "",
      category,
      pay: "",
      deadline,
      description: "",
      tags: [],
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

  // Fetch detail pages for descriptions
  for (const item of unique) {
    try {
      const detail$ = await fetchHTML(item.source_url);
      const bodyText = cleanText(detail$(".xe_content").first().text());
      if (bodyText) {
        item.description = bodyText.slice(0, 2000);
        item.requirements = extractRequirements(bodyText);
      }
      const combined = `${item.title} ${item.description}`;
      item.field = classifyField(combined);
      item.tab = classifyTab(item.title, item.category, item.description);
      item.tags = extractTags(item.title, item.category);
      await randomDelay(1500, 4000);
    } catch (err) {
      console.error(`Detail fetch failed for ${item.source_url}:`, err.message);
      item.field = classifyField(item.title);
      item.tab = classifyTab(item.title, item.category, "");
      item.tags = extractTags(item.title, item.category);
    }
  }

  return unique;
}

function extractTags(title, category) {
  const tags = [];
  if (category) tags.push(category);
  const tagWords = ["캐스팅", "오디션", "단편", "장편", "드라마", "독립영화", "웹드라마", "뮤직비디오", "주연", "조연", "엑스트라", "단역"];
  for (const word of tagWords) {
    if (title.includes(word) && !tags.includes(word)) tags.push(word);
  }
  return tags.slice(0, 5);
}

module.exports = { crawl, SOURCE };
