const { fetchHTML, classifyField, classifyTab, cleanText, randomDelay } = require("../crawlerBase");

const BASE_URL = "https://www.kofic.or.kr";
const LIST_URL = `${BASE_URL}/kofic/business/infm/findJobList.do`;
const SOURCE = "kofic";
const MAX_ITEMS = 15;

async function crawl() {
  const $ = await fetchHTML(LIST_URL);
  const items = [];

  // KOFIC uses table.bbs_ltype with a[onclick="fn_goDetailPage('ID')"] inside rows
  $("table.bbs_ltype tr").each((i, el) => {
    if (items.length >= MAX_ITEMS) return false;

    const $row = $(el);
    // fn_goDetailPage is on <a> tags, not <tr>
    const $link = $row.find("a[onclick*='fn_goDetailPage']").first();
    if (!$link.length) return;

    const onclick = $link.attr("onclick") || "";
    const idMatch = onclick.match(/fn_goDetailPage\('(\d+)'\)/);
    if (!idMatch) return;

    const id = idMatch[1];
    const cells = $row.find("td");
    if (cells.length < 6) return;

    const category = cleanText($(cells[1]).text());
    const status = cleanText($(cells[2]).text());
    const title = cleanText($(cells[3]).text());
    const location = cleanText($(cells[4]).text());
    const company = cleanText($(cells[5]).text());
    const deadline = cleanText($(cells[6]).text()).replace(/\./g, "-");

    if (!title || title.length < 3) return;
    if (!/구인중/.test(status)) return; // only active postings

    const sourceUrl = `${BASE_URL}/kofic/business/infm/findJobDetail.do?boardNumber=${id}`;

    items.push({
      title,
      source_url: sourceUrl,
      company,
      category: category || "영화",
      description: "",
      pay: "",
      deadline,
      location,
      tags: [category, "영화", "구인"].filter(Boolean),
      requirements: {},
    });
  });

  // Fetch detail pages
  for (const item of items) {
    try {
      const detail$ = await fetchHTML(item.source_url);
      const bodyText = cleanText(
        detail$(".bbs_vtype, .view_content, .board_view, article, #content").first().text()
      );
      if (bodyText) {
        item.description = bodyText.slice(0, 2000);
      }
      item.field = classifyField(`${item.title} ${item.description} ${item.category}`, "film");
      item.tab = classifyTab(item.title, item.category, item.description);
      await randomDelay(1500, 3000);
    } catch (err) {
      console.error(`Detail fetch failed for ${item.source_url}:`, err.message);
      item.field = classifyField(`${item.title} ${item.category}`, "film");
      item.tab = classifyTab(item.title, item.category, "");
    }
  }

  return items;
}

module.exports = { crawl, SOURCE };
