const { classifyField, classifyTab, cleanText, randomDelay } = require("../crawlerBase");

const BASE_URL = "https://cine21.com";
const API_URL = `${BASE_URL}/community/recruit/list_items/`;
const SOURCE = "cine21";
const MAX_ITEMS = 15;
const MAX_PAGES = 2;

async function crawl() {
  const items = [];
  const seen = new Set();

  for (let page = 1; page <= MAX_PAGES; page++) {
    try {
      const res = await fetch(`${API_URL}?p=${page}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          "Accept": "application/json, text/javascript, */*; q=0.01",
          "X-Requested-With": "XMLHttpRequest",
          "Referer": `${BASE_URL}/community/recruit`,
        },
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (!data.items || data.items.length === 0) break;

      for (const item of data.items) {
        if (items.length >= MAX_ITEMS) break;

        const title = cleanText(item.wr_subject || "");
        if (!title || title.length < 3) continue;

        const sourceUrl = `${BASE_URL}/community/recruit/${item.wr_id}`;
        if (seen.has(sourceUrl)) continue;
        seen.add(sourceUrl);

        const company = cleanText(item.wr_1 || "");
        const category = cleanText(item.ca_name || "영화");
        const datetime = item.wr_datetime || "";

        items.push({
          title,
          source_url: sourceUrl,
          company,
          category,
          description: "",
          pay: "",
          deadline: "",
          tags: [category, "영화", "구인"].filter(Boolean),
          requirements: {},
          field: classifyField(`${title} ${company} ${category}`),
          tab: classifyTab(title, category, ""),
        });
      }

      if (page < MAX_PAGES) await randomDelay(1000, 2000);
    } catch (err) {
      console.error(`Cine21 API error page ${page}:`, err.message);
      break;
    }
  }

  return items;
}

module.exports = { crawl, SOURCE };
