/**
 * 보안 유틸리티 모듈
 * - Rate limiting (IP 기반)
 * - App token 인증
 * - Timing-safe 비교
 * - 입력 검증 헬퍼
 */

const crypto = require("crypto");

// ─── Rate Limiter (IP 기반, 인메모리) ───────────────────────────────
// Vercel serverless는 인스턴스가 수시로 재생성되므로 완벽하진 않지만,
// 단일 소스 무차별 공격은 효과적으로 차단

const rateLimitStore = new Map();
const CLEANUP_INTERVAL = 60 * 1000; // 1분마다 만료 항목 정리
let lastCleanup = Date.now();

/**
 * Rate limit 체크
 * @param {string} ip - 요청자 IP
 * @param {object} opts - { windowMs, maxRequests }
 * @returns {{ allowed: boolean, remaining: number }}
 */
function checkRateLimit(ip, { windowMs = 60000, maxRequests = 20 } = {}) {
  const now = Date.now();

  // 주기적 정리 (메모리 누수 방지)
  if (now - lastCleanup > CLEANUP_INTERVAL) {
    for (const [key, entry] of rateLimitStore) {
      if (now - entry.start > windowMs * 2) rateLimitStore.delete(key);
    }
    lastCleanup = now;
  }

  const entry = rateLimitStore.get(ip);

  if (!entry || now - entry.start > windowMs) {
    rateLimitStore.set(ip, { start: now, count: 1 });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  entry.count++;
  if (entry.count > maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  return { allowed: true, remaining: maxRequests - entry.count };
}

// ─── App Token 인증 ───────────────────────────────────────────────
// APP_SECRET 환경변수가 설정되면, 모든 유저 API에서 x-app-token 헤더 필수
// 설정 안 되어있으면 패스 (기존 앱 호환)

function verifyAppToken(req) {
  const appSecret = process.env.APP_SECRET;
  if (!appSecret) return true; // 미설정 시 패스 (하위 호환)

  const token = req.headers["x-app-token"] || "";
  if (!token) return false;

  return timingSafeEqual(token, appSecret);
}

// ─── Timing-Safe 문자열 비교 ──────────────────────────────────────
// 타이밍 공격 방지 (일반 === 비교는 첫 번째 불일치에서 즉시 리턴)

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) {
    // 길이가 다르면 어차피 false지만, 일정 시간 소모 후 리턴
    crypto.timingSafeEqual(
      Buffer.from(a.padEnd(32, "\0").slice(0, 32)),
      Buffer.from(b.padEnd(32, "\0").slice(0, 32))
    );
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// ─── Cron 인증 (timing-safe 버전) ────────────────────────────────

function verifyCronAuth(req) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return { ok: false, reason: "CRON_SECRET not configured" };

  const authHeader = req.headers["authorization"] || "";
  const vercelCron = req.headers["x-vercel-cron-secret"] || "";

  const expectedBearer = `Bearer ${cronSecret}`;

  if (timingSafeEqual(authHeader, expectedBearer)) return { ok: true };
  if (timingSafeEqual(vercelCron, cronSecret)) return { ok: true };

  return { ok: false, reason: "Unauthorized" };
}

// ─── 공통 보안 미들웨어 ───────────────────────────────────────────
// 각 API 핸들러 최상단에 호출

/**
 * @param {Request} req
 * @param {Response} res
 * @param {object} opts
 * @param {number} opts.maxRequests - 분당 최대 요청 수
 * @param {boolean} opts.requireAppToken - 앱 토큰 필수 여부
 * @returns {boolean} true면 요청 거부됨 (이미 응답 전송)
 */
function applySecurityChecks(req, res, { maxRequests = 20, requireAppToken = true } = {}) {
  // 1. Rate limiting
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim()
    || req.headers["x-real-ip"]
    || req.socket?.remoteAddress
    || "unknown";

  const rateCheck = checkRateLimit(ip, { maxRequests });
  if (!rateCheck.allowed) {
    res.status(429).json({ error: "Too many requests. Please try again later." });
    return true;
  }
  res.setHeader("X-RateLimit-Remaining", rateCheck.remaining);

  // 2. App token 인증
  if (requireAppToken && !verifyAppToken(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return true;
  }

  return false; // 정상 — 계속 진행
}

// ─── 입력 검증 헬퍼 ──────────────────────────────────────────────

function isValidString(value, { minLength = 1, maxLength = Infinity } = {}) {
  return typeof value === "string" && value.length >= minLength && value.length <= maxLength;
}

function sanitizeForLog(str, maxLen = 200) {
  if (typeof str !== "string") return "[non-string]";
  // 제어 문자, ANSI 이스케이프 시퀀스 제거 (로그 인젝션 방지)
  return str.replace(/[\x00-\x1F\x7F]/g, "").slice(0, maxLen);
}

module.exports = {
  checkRateLimit,
  verifyAppToken,
  timingSafeEqual,
  verifyCronAuth,
  applySecurityChecks,
  isValidString,
  sanitizeForLog,
};
