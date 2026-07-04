// Vercel serverless function: POST /api/report
// Bug/feedback reporting endpoint - saves to Supabase

const { supabase } = require("../lib/supabase");
const { applySecurityChecks } = require("../lib/security");

const VALID_TYPES = ["bug", "feedback", "suggestion", "crash", "unknown"];
const MAX_PAYLOAD_SIZE = 10000; // 10KB

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-App-Token");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 보안: Rate limit (분당 5회 — 남용 방지) + App token
  if (applySecurityChecks(req, res, { maxRequests: 5 })) return;

  if (!supabase) {
    return res.status(500).json({ error: "Server configuration error" });
  }

  const report = req.body;
  if (!report || typeof report !== "object") {
    return res.status(400).json({ error: "Invalid request body" });
  }

  // 페이로드 크기 제한 — DB 스토리지 남용 방지
  const raw = JSON.stringify(report);
  if (raw.length > MAX_PAYLOAD_SIZE) {
    return res.status(413).json({ error: "Payload too large" });
  }

  const type = VALID_TYPES.includes(report.type) ? report.type : "unknown";

  try {
    const { error } = await supabase.from("reports").insert({
      type,
      payload: report,
      created_at: new Date().toISOString(),
    });
    if (error) {
      console.error("[REPORT DB ERROR]", error.message);
      return res.status(200).json({ success: false, message: "Report received but save failed" });
    }
  } catch (e) {
    console.error("[REPORT DB ERROR]", e.message);
    return res.status(200).json({ success: false, message: "Report received but save failed" });
  }

  return res.status(200).json({ success: true, message: "Report saved" });
};
