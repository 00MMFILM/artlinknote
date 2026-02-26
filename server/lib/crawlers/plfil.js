const { fetchHTML, classifyField, classifyTab, extractRequirements, cleanText, randomDelay } = require("../crawlerBase");

const BASE_URL = "https://www.plfil.com";
const LIST_URL = `${BASE_URL}/casting`;
const SOURCE = "plfil";
const MAX_ITEMS = 20;

async function crawl() {
  const $ = await fetchHTML(LIST_URL);
  const items = [];

  // plfil uses React — try to extract from __NEXT_DATA__ or embedded JSON
  const nextDataScript = $("script#__NEXT_DATA__").html();
  if (nextDataScript) {
    try {
      const nextData = JSON.parse(nextDataScript);
      const castings = findCastingData(nextData);
      for (const c of castings.slice(0, MAX_ITEMS)) {
        items.push({
          title: c.title || "",
          source_url: `${BASE_URL}/casting/${c.id}`,
          company: c.companyName || c.company || "",
          category: c.artCategoryName || c.category || "캐스팅",
          description: c.description || c.content || "",
          pay: formatPay(c.minReward, c.maxReward),
          deadline: formatDate(c.castingEndDate || c.endDate),
          field: classifyField(`${c.title || ""} ${c.artCategoryName || ""}`),
          tags: [c.artCategoryName, "캐스팅"].filter(Boolean),
          requirements: {},
        });
      }
    } catch (err) {
      console.error("Failed to parse __NEXT_DATA__:", err.message);
    }
  }

  // Fallback: parse HTML directly if no JSON data
  if (items.length === 0) {
    $("a[href*='/casting/']").each((i, el) => {
      if (items.length >= MAX_ITEMS) return false;
      const $el = $(el);
      const href = $el.attr("href");
      if (!href || href === "/casting") return;

      const title = cleanText($el.text());
      if (!title || title.length < 3) return;

      const sourceUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;
      items.push({
        title,
        source_url: sourceUrl,
        company: "",
        category: "캐스팅",
        description: "",
        pay: "",
        deadline: "",
        tags: ["캐스팅"],
        requirements: {},
      });
    });
  }

  // Fetch detail pages for items missing description
  for (const item of items) {
    if (item.description) {
      item.requirements = extractRequirements(item.description);
      item.tab = classifyTab(item.title, item.category, item.description);
      continue;
    }
    try {
      const detail$ = await fetchHTML(item.source_url);

      // Try __NEXT_DATA__ on detail page
      const detailScript = detail$("script#__NEXT_DATA__").html();
      if (detailScript) {
        const detailData = JSON.parse(detailScript);
        const desc = findDescription(detailData);
        if (desc) item.description = desc.slice(0, 2000);
      }

      if (!item.description) {
        item.description = cleanText(detail$("main, article, .content").first().text()).slice(0, 2000);
      }

      item.requirements = extractRequirements(item.description);
      item.field = classifyField(`${item.title} ${item.description}`);
      item.tab = classifyTab(item.title, item.category, item.description);
      await randomDelay(1500, 4000);
    } catch (err) {
      console.error(`Detail fetch failed for ${item.source_url}:`, err.message);
      item.tab = classifyTab(item.title, item.category, "");
    }
  }

  return items;
}

function findCastingData(obj) {
  if (!obj || typeof obj !== "object") return [];
  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (item && item.title && (item.id || item.castingId)) return obj;
      const found = findCastingData(item);
      if (found.length > 0) return found;
    }
    return [];
  }
  for (const val of Object.values(obj)) {
    const found = findCastingData(val);
    if (found.length > 0) return found;
  }
  return [];
}

function findDescription(obj) {
  if (!obj || typeof obj !== "object") return null;
  if (typeof obj.description === "string" && obj.description.length > 20) return obj.description;
  if (typeof obj.content === "string" && obj.content.length > 20) return obj.content;
  for (const val of Object.values(obj)) {
    const found = findDescription(val);
    if (found) return found;
  }
  return null;
}

function formatPay(min, max) {
  if (!min && !max) return "";
  if (min && max) return `${min}만원~${max}만원`;
  return `${min || max}만원`;
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toISOString().split("T")[0];
  } catch {
    return dateStr;
  }
}

module.exports = { crawl, SOURCE };
