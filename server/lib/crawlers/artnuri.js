const { fetchHTML, classifyField, classifyTab, cleanText, randomDelay } = require("../crawlerBase");

const BASE_URL = "https://www.artnuri.or.kr";
const LIST_URL = `${BASE_URL}/crawler/info/search.do?key=2301170002`;
const SOURCE = "artnuri";
const MAX_ITEMS = 20;

async function crawl() {
  const $ = await fetchHTML(LIST_URL);
  const items = [];

  // artnuri uses ul.card > li structure
  // Each li has: span.state, a.title (with goView onclick), ul.txt (metadata), ul.hashtag
  $("ul.card > li").each((i, el) => {
    if (items.length >= MAX_ITEMS) return false;

    const $li = $(el);
    const $titleLink = $li.find("a.title").first();
    if (!$titleLink.length) return;

    const title = cleanText($titleLink.text());
    if (!title || title.length < 5) return;

    // Extract ID from goView('ID', 'org', 'type') onclick
    const onclick = $titleLink.attr("onclick") || "";
    const idMatch = onclick.match(/goView\('([^']+)'/);
    const itemId = idMatch ? idMatch[1] : "";

    // Construct a stable source URL using the ID
    const sourceUrl = itemId
      ? `${BASE_URL}/crawler/info/view.do?bsnsNo=${itemId}`
      : `${BASE_URL}/search?q=${encodeURIComponent(title)}`;

    // Status
    const status = cleanText($li.find("span.state-st2").text());

    // Metadata from ul.txt
    let company = "";
    let deadline = "";
    let target = "";

    $li.find("ul.txt li").each((j, metaEl) => {
      const label = cleanText($(metaEl).find("strong").text());
      const value = cleanText($(metaEl).find("em").text());
      if (label === "주관기관" || label.includes("주관")) {
        // Get org name from onclick or logo alt
        const orgOnclick = $li.find("a.title").attr("onclick") || "";
        const orgMatch = orgOnclick.match(/goView\('[^']+',\s*'([^']+)'/);
        company = orgMatch ? orgMatch[1] : value;
      }
      if (label === "마감일" || label.includes("마감")) deadline = value;
      if (label === "지원대상" || label.includes("대상")) target = value;
    });

    // Hashtags
    const tags = [];
    $li.find("ul.hashtag a").each((j, tagEl) => {
      const tag = cleanText($(tagEl).text()).replace(/^#/, "");
      if (tag && tag.length > 1) tags.push(tag);
    });

    // Classify field from tags and title
    const tagText = tags.join(" ");
    const combined = `${title} ${tagText} ${company}`;
    const field = classifyField(combined);

    // Build category from hashtags (skip org name tags)
    const categoryTag = tags.find((t) =>
      ["문학", "시각예술", "음악", "무용", "연극", "뮤지컬", "영화", "전체", "공예", "사진", "디자인"].includes(t)
    );
    const category = categoryTag || "예술지원";

    items.push({
      title,
      source_url: sourceUrl,
      company,
      category,
      field,
      description: `${status ? `[${status}] ` : ""}${title}. 주관: ${company}. 대상: ${target}.`,
      pay: "",
      deadline,
      tags: tags.length > 0 ? tags : [category, "예술지원"],
      tab: classifyTab(title, category, ""),
      requirements: {},
    });
  });

  return items;
}

module.exports = { crawl, SOURCE };
