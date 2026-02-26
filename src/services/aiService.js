/**
 * aiService.js
 *
 * AI analysis service for Artlink React Native.
 * - Routes through Vercel serverless proxy (no API key on device)
 * - 6 field-specific AI prompts (acting, music, art, dance, literature, film)
 * - buildAIPrompt with history/personal/progress context
 * - analyzeNote with heuristic fallback
 * - Uses native fetch() (React Native compatible)
 */

import { FIELDS } from '../utils/helpers';
import { computeArtistProfile } from './analyticsService';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const AI_CONFIG = {
  serverURL: 'https://artlink-server.vercel.app',
  timeoutMs: 30000,
};

/**
 * Override the server URL at runtime (e.g. from env or AsyncStorage).
 * @param {string} url
 */
export function setServerURL(url) {
  AI_CONFIG.serverURL = url;
}

// ---------------------------------------------------------------------------
// Field-Specific AI Prompts
// ---------------------------------------------------------------------------

export const FIELD_AI_PROMPTS = {
  acting: `당신은 스타니슬랍스키 시스템과 마이즈너 테크닉에 정통한 연기 코치입니다.
배우의 연습 노트를 분석하여 다음을 중점적으로 피드백해주세요:
- 감정곡선: 장면 속 감정의 흐름과 변화 지점
- 서브텍스트: 대사 이면의 숨겨진 의도와 욕구
- 비트 분석: 장면의 전환점과 행동 단위
- 캐릭터의 목표(objective)와 장애물(obstacle) 관계`,

  music: `당신은 음악 전문 코치입니다. 연습 노트를 분석하여 다음을 중점적으로 피드백해주세요:
- 음정(pitch): 정확도와 음정 이동의 자연스러움
- 리듬(rhythm): 박자감, 싱코페이션, 그루브
- 다이내믹(dynamics): 강약 조절, 크레센도/디크레센도 활용
- 프레이징(phrasing): 음악적 문장 구성과 호흡`,

  art: `당신은 미술 전문 코치입니다. 작업 노트를 분석하여 다음을 중점적으로 피드백해주세요:
- 구도(composition): 화면 구성, 시선 유도, 균형
- 색채(color): 색 조합, 색온도, 대비
- 질감(texture): 표면 처리, 붓터치, 재료 활용
- 명암(value): 빛과 그림자, 입체감 표현`,

  dance: `당신은 무용 전문 코치이며 라반 무보법(Laban Movement Analysis)에 정통합니다.
연습 노트를 분석하여 다음을 중점적으로 피드백해주세요:
- 코어(core): 중심 근력과 안정성
- 공간(space): 키네스피어(kinesphere) 활용, 레벨 변화
- 무게이동(weight shift): 체중 이동의 질감과 흐름
- 신체 연결성과 움직임의 흐름(flow)`,

  literature: `당신은 문학 전문 코치입니다. 창작 노트를 분석하여 다음을 중점적으로 피드백해주세요:
- 서사(narrative): 이야기 구조, 플롯 전개, 갈등 설정
- 캐릭터(character): 인물의 깊이, 동기, 성장 곡선
- 문체(style): 문장 리듬, 단어 선택, 톤 일관성
- 은유(metaphor): 상징과 비유의 효과적 활용`,

  film: `당신은 영화 전문 코치입니다. 작업 노트를 분석하여 다음을 중점적으로 피드백해주세요:
- 앵글(angle): 카메라 위치, 샷 사이즈, 화면 구성
- 조명(lighting): 조명 설계, 분위기 연출
- 편집(editing): 컷의 리듬, 장면 전환, 몽타주
- 사운드(sound): 음향 설계, 음악 활용, 침묵의 활용`,
};

// ---------------------------------------------------------------------------
// Feedback Format Spec  (emoji markers: pin, muscle, target, palette, chart, soon)
// ---------------------------------------------------------------------------

const FEEDBACK_FORMAT_TEMPLATE = `
피드백 형식 (반드시 지켜주세요):
\u{1F4CC} 전체 인상 (2문장)
\u{1F4AA} 강점 (2-3문장)
\u{1F3AF} 개선 포인트 (2-3문장)
{rolemodelSection}
{growthSection}
\u{1F51C} 다음 스텝 (1-2문장)

500-700자, 한국어, 따뜻하지만 전문적인 톤으로 작성하세요.`;

// ---------------------------------------------------------------------------
// buildAIPrompt
// ---------------------------------------------------------------------------

/**
 * Build system prompt + user message for AI analysis.
 *
 * Incorporates three context layers:
 *   1. History context  -- same-field recent 3 notes with existing AI feedback
 *   2. Personal context -- role models, interests
 *   3. Progress context -- streak days, total note count
 *
 * @param {string}  field       - One of: acting, music, art, dance, literature, film
 * @param {string}  content     - The note body text
 * @param {Array}   savedNotes  - All saved notes (for history context)
 * @param {Object}  userProfile - { name, email, fields, userType, roleModels, interests }
 * @returns {{ systemPrompt: string, userMessage: string }}
 */
export function buildAIPrompt(field, content, savedNotes = [], userProfile = {}) {
  const basePrompt = FIELD_AI_PROMPTS[field] || FIELD_AI_PROMPTS.acting;

  // --- History context: same-field recent 3 notes with AI feedback ---
  const sameFieldNotes = savedNotes
    .filter(
      (n) =>
        n.field === field &&
        n.aiComment &&
        n.aiComment.trim().length > 0
    )
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, 3);

  let historyContext = '';
  if (sameFieldNotes.length > 0) {
    historyContext = '\n\n[이전 피드백 히스토리]\n';
    sameFieldNotes.forEach((note, i) => {
      const snippet = (note.aiComment || '').substring(0, 100);
      historyContext += `${i + 1}. ${note.title}: ${snippet}...\n`;
    });
  }

  // --- Personal context: role models, interests ---
  const roleModels = userProfile.roleModels || [];
  const interests = userProfile.interests || [];

  let personalContext = '';
  if (roleModels.length > 0) {
    personalContext += `\n\n[사용자 롤모델] ${roleModels.join(', ')}`;
  }
  if (interests.length > 0) {
    personalContext += `\n[사용자 관심분야] ${interests.join(', ')}`;
  }

  // --- Progress context: streak, total notes ---
  const artistProfile = computeArtistProfile(savedNotes, userProfile);
  const progressContext =
    `\n\n[성장 현황] 연속 기록 ${artistProfile.streak}일, 총 ${artistProfile.totalNotes}개 노트`;

  // --- Build format section ---
  const hasRoleModels = roleModels.length > 0;
  const hasPreviousNotes = sameFieldNotes.length > 0;

  let formatStr = FEEDBACK_FORMAT_TEMPLATE;
  formatStr = formatStr.replace(
    '{rolemodelSection}',
    hasRoleModels ? '\u{1F3A8} 롤모델 연결 (1-2문장)' : ''
  );
  formatStr = formatStr.replace(
    '{growthSection}',
    hasPreviousNotes ? '\u{1F4C8} 성장 트래킹 (1-2문장)' : ''
  );

  const systemPrompt =
    basePrompt + historyContext + personalContext + progressContext + formatStr;

  const fieldInfo = FIELDS[field] || FIELDS.acting;
  const userMessage = `다음은 ${fieldInfo.label} 분야 연습 노트입니다:\n\n${content}`;

  return { systemPrompt, userMessage };
}

// ---------------------------------------------------------------------------
// requestAIAnalysis  (POST /api/ai-analyze to Vercel proxy)
// ---------------------------------------------------------------------------

/**
 * Call the Vercel server proxy for AI analysis.
 *
 * The server forwards to Anthropic Claude API using a server-side key.
 * Request body: { systemPrompt, userMessage }
 * Response body: { result: string }
 *
 * @param {string} systemPrompt
 * @param {string} userMessage
 * @returns {Promise<string>} AI response text
 * @throws {Error} On network timeout, non-200 status, or empty response
 */
async function requestAIAnalysis(systemPrompt, userMessage) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_CONFIG.timeoutMs);

  try {
    const response = await fetch(`${AI_CONFIG.serverURL}/api/ai-analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemPrompt, userMessage }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`서버 오류 (${response.status}). 다시 시도해주세요.`);
    }

    const data = await response.json();
    if (!data.result || data.result.trim().length === 0) {
      throw new Error('AI 응답이 비어있습니다.');
    }

    return data.result;
  } catch (err) {
    clearTimeout(timeoutId);

    // Rethrow with user-friendly Korean message for known error types
    if (err.name === 'AbortError') {
      throw new Error('요청 시간이 초과되었습니다. 연결을 확인해주세요.');
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Heuristic Fallback
// ---------------------------------------------------------------------------

/**
 * Generate a basic heuristic feedback when the server is unavailable.
 * Mirrors the Swift `heuristicFallback` function exactly.
 *
 * @param {string} field   - Field key
 * @param {string} content - Note body
 * @returns {string}       - Formatted feedback text
 */
export function heuristicFallback(field, content) {
  const hasKorean = /[\uAC00-\uD7A3]/.test(content);

  // Tokenize
  const words = content
    .toLowerCase()
    .split(/[^a-zA-Z0-9\uAC00-\uD7A3]+/)
    .filter((w) => w.length >= 2);

  const koreanStopwords = new Set([
    '이', '그', '저', '것', '수', '등', '들', '에', '의', '를', '을',
    '가', '는', '은', '하다', '되다', '있다', '없다',
  ]);
  const englishStopwords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'have', 'has',
    'had', 'do', 'does', 'did', 'and', 'or', 'but', 'in', 'on', 'at',
    'to', 'for', 'of', 'with',
  ]);

  const stopwords = hasKorean ? koreanStopwords : englishStopwords;

  // Frequency map
  const freq = {};
  for (const word of words) {
    if (stopwords.has(word)) continue;
    freq[word] = (freq[word] || 0) + 1;
  }

  const topKeywords = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k]) => k);

  const keywordStr = topKeywords.length === 0 ? '내용' : topKeywords.join(', ');

  const wordCount = words.length;
  let lengthComment;
  if (wordCount > 200) {
    lengthComment = '풍부한 분량의 기록이네요.';
  } else if (wordCount > 50) {
    lengthComment = '적절한 분량의 기록입니다.';
  } else {
    lengthComment = '좀 더 자세히 기록하면 더 깊은 분석이 가능합니다.';
  }

  const fieldInfo = FIELDS[field] || FIELDS.acting;

  return `\u{1F4CC} 전체 인상
${fieldInfo.emoji} ${fieldInfo.label} 분야의 연습 노트를 분석했습니다. ${lengthComment}

\u{1F4AA} 강점
${keywordStr}에 대한 관찰이 돋보입니다. 구체적인 기록 습관이 좋습니다.

\u{1F3AF} 개선 포인트
더 구체적인 감각 묘사를 추가해보세요. 무엇을 느꼈는지, 어떤 변화가 있었는지 기록하면 성장에 도움이 됩니다.

\u{1F51C} 다음 스텝
오늘 발견한 포인트를 다음 연습에서 의식적으로 적용해보세요.`;
}

// ---------------------------------------------------------------------------
// analyzeNote  (public entry point)
// ---------------------------------------------------------------------------

/**
 * Analyse a note via server proxy, falling back to heuristic on any error.
 *
 * @param {string}  field        - Field key (acting, music, art, dance, literature, film)
 * @param {string}  content      - Note body text
 * @param {Array}   savedNotes   - All persisted notes
 * @param {Object}  userProfile  - User profile object
 * @returns {Promise<string>}    - Feedback text (AI or heuristic)
 */
export async function analyzeNote(field, content, savedNotes = [], userProfile = {}) {
  const { systemPrompt, userMessage } = buildAIPrompt(
    field,
    content,
    savedNotes,
    userProfile
  );

  try {
    return await requestAIAnalysis(systemPrompt, userMessage);
  } catch (_err) {
    return heuristicFallback(field, content);
  }
}
