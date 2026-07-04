// Vercel serverless function: POST /api/transcribe
// Video-to-audio transcription via FFmpeg + OpenAI Whisper

const { execFileSync } = require("child_process");
const { readFileSync, unlinkSync, chmodSync } = require("fs");
const { join } = require("path");
const os = require("os");
const ffmpegPath = require("ffmpeg-static");

/**
 * URL 보안 검증 — SSRF 방지
 * - HTTPS만 허용 (file://, ftp://, gopher://, data:// 등 차단)
 * - 내부 네트워크 IP 차단 (127.0.0.1, 10.x, 172.16-31.x, 192.168.x, 169.254.x)
 * - localhost 차단
 */
function validateVideoUrl(urlString) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    return { valid: false, reason: "Invalid URL format" };
  }

  // HTTPS만 허용
  if (parsed.protocol !== "https:") {
    return { valid: false, reason: "Only HTTPS URLs are allowed" };
  }

  const hostname = parsed.hostname.toLowerCase();

  // localhost 차단
  if (hostname === "localhost" || hostname === "[::1]") {
    return { valid: false, reason: "Internal URLs are not allowed" };
  }

  // IP 주소 직접 접근 차단 (내부망 SSRF 방지)
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b, c] = ipv4Match.map(Number);
    if (
      a === 127 ||                          // 127.0.0.0/8
      a === 10 ||                           // 10.0.0.0/8
      (a === 172 && b >= 16 && b <= 31) ||  // 172.16.0.0/12
      (a === 192 && b === 168) ||           // 192.168.0.0/16
      (a === 169 && b === 254) ||           // 169.254.0.0/16 (클라우드 메타데이터)
      a === 0                               // 0.0.0.0/8
    ) {
      return { valid: false, reason: "Internal URLs are not allowed" };
    }
  }

  return { valid: true };
}

const { applySecurityChecks } = require("../lib/security");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-App-Token");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  // 보안: Rate limit (분당 5회 — 비용 높은 API) + App token
  if (applySecurityChecks(req, res, { maxRequests: 5 })) return;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey)
    return res.status(500).json({ error: "Server configuration error" });

  const tmpDir = os.tmpdir();
  const ts = Date.now();
  const outputPath = join(tmpDir, `output_${ts}.mp3`);

  try {
    const { videoUrl } = req.body || {};
    if (!videoUrl || typeof videoUrl !== "string")
      return res.status(400).json({ error: "videoUrl required" });

    // SSRF 방지: URL 검증
    const urlCheck = validateVideoUrl(videoUrl);
    if (!urlCheck.valid) {
      return res.status(400).json({ error: urlCheck.reason });
    }

    // FFmpeg reads directly from URL (streaming, no full download to memory)
    try {
      chmodSync(ffmpegPath, 0o755);
    } catch {}

    execFileSync(
      ffmpegPath,
      [
        "-protocol_whitelist", "https,tls,tcp",  // file://, gopher:// 등 완전 차단
        "-i", videoUrl,
        "-vn", "-acodec", "libmp3lame", "-q:a", "8", "-y",
        outputPath,
      ],
      { timeout: 90000, stdio: "pipe" }
    );

    const audioBuffer = readFileSync(outputPath);

    // Send audio to Whisper API
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([audioBuffer], { type: "audio/mpeg" }),
      "audio.mp3"
    );
    formData.append("model", "whisper-1");
    formData.append("language", "ko");
    formData.append("response_format", "text");

    const whisperRes = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
      }
    );

    if (!whisperRes.ok) {
      const errText = await whisperRes.text();
      console.error("[transcribe] Whisper error:", errText);
      return res.status(502).json({ error: "Transcription failed" });
    }

    const transcript = await whisperRes.text();
    return res.status(200).json({ transcript: transcript.trim() });
  } catch (error) {
    console.error("[transcribe] Error:", error.message);
    return res.status(500).json({ error: "Transcription failed" });
  } finally {
    try { unlinkSync(outputPath); } catch {}
  }
};

module.exports.config = { maxDuration: 120 };
