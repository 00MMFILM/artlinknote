const { supabase } = require("../lib/supabase");

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  if (!supabase) {
    return res.status(503).json({ error: "Database not configured" });
  }

  try {
    // Get latest crawl log per source
    const { data: logs, error: logError } = await supabase
      .from("crawl_logs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(30);

    if (logError) throw logError;

    // Group by source — most recent per source
    const bySource = {};
    for (const log of logs || []) {
      if (!bySource[log.source]) {
        bySource[log.source] = log;
      }
    }

    // Get posting counts per source
    const { data: counts, error: countError } = await supabase
      .from("postings")
      .select("source", { count: "exact", head: true });

    // Get total active postings
    const { count: totalActive } = await supabase
      .from("postings")
      .select("*", { count: "exact", head: true })
      .eq("status", "active");

    return res.status(200).json({
      sources: Object.values(bySource),
      totalActivePostings: totalActive || 0,
      recentLogs: (logs || []).slice(0, 20),
    });
  } catch (err) {
    console.error("crawl-status error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
};
