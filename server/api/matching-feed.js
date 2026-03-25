const { supabase } = require("../lib/supabase");

// Self-healing: trigger crawl if data is stale (> 24 hours)
async function triggerCrawlIfStale() {
  try {
    const { data } = await supabase
      .from("crawl_logs")
      .select("started_at")
      .order("started_at", { ascending: false })
      .limit(1);
    if (!data || data.length === 0) return;
    const lastCrawl = new Date(data[0].started_at);
    const hoursSince = (Date.now() - lastCrawl.getTime()) / 3600000;
    if (hoursSince > 24) {
      // Fire-and-forget: trigger crawl in background
      const secret = process.env.CRON_SECRET;
      const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "https://server-00mmfilms-projects.vercel.app";
      fetch(`${baseUrl}/api/crawl-trigger`, {
        method: "GET",
        headers: secret ? { Authorization: `Bearer ${secret}` } : {},
        signal: AbortSignal.timeout(55000),
      }).catch(() => {});
    }
  } catch {}
}

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (!supabase) {
    return res.status(503).json({ error: "Database not configured" });
  }

  // Check staleness in background (doesn't block response)
  triggerCrawlIfStale();

  try {
    // Accept both GET query params and POST body
    const params = req.method === "POST" ? (req.body || {}) : (req.query || {});
    const { userFields, field, page = 1, limit = 30, tab } = params;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 30));
    const offset = (pageNum - 1) * limitNum;

    let query = supabase
      .from("postings")
      .select("*", { count: "exact" })
      .eq("status", "active")
      .order("crawled_at", { ascending: false })
      .range(offset, offset + limitNum - 1);

    // Filter by field(s)
    const fields = userFields || (field ? [field] : null);
    if (fields && fields.length > 0) {
      query = query.in("field", fields);
    }

    // Filter by tab
    if (tab) {
      query = query.eq("tab", tab);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    // Map to client format (matching matchingService.js expectations)
    const posts = (data || []).map((row) => ({
      id: row.id,
      source: "ai",
      sourcePlatform: formatSourceName(row.source),
      tab: row.tab || "프로젝트",
      title: row.title,
      company: row.company || "",
      field: row.field || "acting",
      description: row.description || "",
      deadline: row.deadline || "",
      pay: row.pay || "",
      location: row.location || "",
      tags: row.tags || [],
      requirements: row.requirements || {},
      sourceUrl: row.source_url,
    }));

    // Client expects a flat array (see matchingService.js line 49)
    return res.status(200).json(posts);
  } catch (err) {
    console.error("matching-feed error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
};

function formatSourceName(source) {
  const names = {
    filmmakers: "필름메이커스",
    plfil: "플필",
    castingnara: "캐스팅나라",
    otr: "OTR",
    contestkorea: "콘테스트코리아",
    artnuri: "아트누리",
  };
  return names[source] || source;
}
