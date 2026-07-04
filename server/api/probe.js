// 임시 프로브 — 후보 사이트가 클라우드 IP에서 열리는지 확인용 (검증 후 삭제 예정)
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

module.exports = async function handler(req, res) {
  const url = req.query && req.query.url;
  if (!url) return res.status(400).json({ error: "url param required" });
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9",
        "Referer": new URL(url).origin + "/",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });
    const body = await r.text();
    return res.status(200).json({
      status: r.status,
      length: body.length,
      // 목록성 페이지인지 대략 판단: 링크/행 개수
      anchors: (body.match(/<a\s/gi) || []).length,
      snippet: body.slice(0, 200).replace(/\s+/g, " "),
    });
  } catch (e) {
    return res.status(200).json({ error: String(e).slice(0, 120) });
  }
};
