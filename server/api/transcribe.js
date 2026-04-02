// Vercel serverless function: POST /api/transcribe
// Video-to-audio transcription via FFmpeg + OpenAI Whisper

const { execSync } = require("child_process");
const { readFileSync, unlinkSync, chmodSync } = require("fs");
const { join } = require("path");
const os = require("os");
const ffmpegPath = require("ffmpeg-static");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey)
    return res.status(500).json({ error: "OPENAI_API_KEY not configured" });

  const tmpDir = os.tmpdir();
  const ts = Date.now();
  const outputPath = join(tmpDir, `output_${ts}.mp3`);

  try {
    const { videoUrl } = req.body || {};
    if (!videoUrl)
      return res.status(400).json({ error: "videoUrl required" });

    // FFmpeg reads directly from URL (streaming, no full download to memory)
    try {
      chmodSync(ffmpegPath, 0o755);
    } catch {}

    execSync(
      `${ffmpegPath} -i "${videoUrl}" -vn -acodec libmp3lame -q:a 8 -y "${outputPath}"`,
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
