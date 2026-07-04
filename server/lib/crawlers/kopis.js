const { classifyField, classifyTab, cleanText, randomDelay } = require("../crawlerBase");

const BASE_URL = "https://www.kopis.or.kr";
const SOURCE = "kopis";
const MAX_ITEMS = 20;

// KOPIS 공연예술통합전산망 — uses JSON API for performance listings
async function crawl() {
  const items = [];

  try {
    // KOPIS list page for auditions/recruitment
    const url = `${BASE_URL}/por/db/pblprfr/pblprfrList.json?page=1&rows=${MAX_ITEMS}&cpage=1`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "ArtlinkBot/1.0",
        "Accept": "application/json",
        "Referer": BASE_URL,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      // Fallback to HTML crawling
      return await crawlHTML();
    }

    const data = await res.json();
    const list = data.resultList || data.list || data.items || [];

    for (const entry of list.slice(0, MAX_ITEMS)) {
      const title = cleanText(entry.prfnm || entry.title || "");
      if (!title || title.length < 3) continue;

      const sourceUrl = entry.mt20id
        ? `${BASE_URL}/por/db/pblprfr/pblprfrView.do?mt20Id=${entry.mt20id}`
        : `${BASE_URL}/por/db/pblprfr/pblprfrList.do`;

      const combined = `${title} ${entry.genrenm || ""}`;
      items.push({
        title,
        source_url: sourceUrl,
        company: cleanText(entry.entrpsnm || entry.fcltynm || ""),
        category: cleanText(entry.genrenm || "공연"),
        field: classifyField(combined, "acting"),
        description: cleanText(entry.prfpdfrom ? `${entry.prfpdfrom} ~ ${entry.prfpdto || ""}` : ""),
        pay: "",
        deadline: entry.prfpdto || "",
        tags: [entry.genrenm || "공연"].filter(Boolean),
        tab: classifyTab(title, entry.genrenm || "", ""),
        requirements: {},
      });
    }
  } catch (err) {
    console.error(`[kopis] API crawl error:`, err.message);
    return await crawlHTML();
  }

  return items;
}

// Fallback HTML crawling
async function crawlHTML() {
  const { fetchHTML } = require("../crawlerBase");
  const url = `${BASE_URL}/por/db/pblprfr/pblprfrList.do`;
  const $ = await fetchHTML(url);
  if (!$) return [];
  const items = [];
  const seen = new Set();

  $("a[href*='pblprfrView'], a[href*='mt20Id=']").each((i, el) => {
    if (items.length >= MAX_ITEMS) return false;

    const $link = $(el);
    const href = $link.attr("href") || "";
    const title = cleanText($link.text());
    if (!title || title.length < 3) return;

    const sourceUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    if (seen.has(sourceUrl)) return;
    seen.add(sourceUrl);

    items.push({
      title,
      source_url: sourceUrl,
      company: "",
      category: "공연",
      field: classifyField(title, "acting"),
      description: "",
      pay: "",
      deadline: "",
      tags: ["공연"],
      tab: classifyTab(title, "공연", ""),
      requirements: {},
    });
  });

  return items;
}

module.exports = { crawl, SOURCE };
