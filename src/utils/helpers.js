/**
 * helpers.js
 *
 * Shared constants, field labels/emojis, date formatting, and text utilities
 * for Artlink React Native.
 */

// ---------------------------------------------------------------------------
// Field Definitions (label, emoji, englishKeyword)
// ---------------------------------------------------------------------------

export const FIELDS = {
  acting: { label: '연기', emoji: '\u{1F3AD}', englishKeyword: 'acting' },
  music: { label: '음악', emoji: '\u{1F3B5}', englishKeyword: 'music' },
  art: { label: '미술', emoji: '\u{1F3A8}', englishKeyword: 'art' },
  dance: { label: '무용', emoji: '\u{1F483}', englishKeyword: 'dance' },
  literature: { label: '문학', emoji: '\u{1F4D6}', englishKeyword: 'literature' },
  film: { label: '영화', emoji: '\u{1F3AC}', englishKeyword: 'film' },
};

export const FIELD_KEYS = Object.keys(FIELDS);

/**
 * Return the field info object, defaulting to acting if unknown.
 * @param {string} field
 * @returns {{ label: string, emoji: string, englishKeyword: string }}
 */
export function getFieldInfo(field) {
  return FIELDS[field] || FIELDS.acting;
}

// ---------------------------------------------------------------------------
// Note Filter Enum
// ---------------------------------------------------------------------------

export const NOTE_FILTERS = {
  all: 'all',
  starred: 'starred',
};

// ---------------------------------------------------------------------------
// Summary Levels (progressive zoom)
// ---------------------------------------------------------------------------

export const SUMMARY_LEVELS = {
  keywords: { value: 1, displayName: 'Keywords', icon: 'key' },
  line: { value: 2, displayName: 'Line', icon: 'text-fields' },
  brief: { value: 3, displayName: 'Brief', icon: 'description' },
  full: { value: 4, displayName: 'Full', icon: 'edit' },
};

// ---------------------------------------------------------------------------
// Stopwords
// ---------------------------------------------------------------------------

export const KOREAN_STOPWORDS = new Set([
  '이', '그', '저', '것', '수', '등', '들', '및', '에', '의', '를', '을',
  '가', '는', '은', '로', '으로', '에서', '와', '과', '도', '만',
  '이런', '저런', '그런', '어떤', '무슨', '이것', '저것', '그것',
  '하다', '되다', '있다', '없다', '같다', '보다', '주다', '받다',
  '하고', '하는', '하면', '해서',
  '그리고', '하지만', '그러나', '그래서', '따라서', '또한', '즉',
  '왜냐하면', '때문에', '위해',
]);

export const ENGLISH_STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'its', 'our', 'their', 'this', 'that', 'these', 'those',
  'and', 'or', 'but', 'if', 'then', 'else', 'when', 'where', 'why', 'how',
  'what', 'which',
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'into',
  'through',
  'just', 'also', 'very', 'really', 'only', 'even', 'about', 'after', 'before',
  'more',
]);

/**
 * Acting-domain keywords for TF-IDF boost scoring.
 */
export const ACTING_KEYWORDS = new Set([
  '감정', '캐릭터', '연기', '대사', '장면', '동기', '목표', '갈등',
  '서브텍스트', '비트',
  'emotion', 'character', 'acting', 'dialogue', 'scene', 'motivation',
  'objective', 'conflict', 'subtext', 'beat', 'monologue', 'rehearsal',
  'technique',
]);

// ---------------------------------------------------------------------------
// Date Formatting
// ---------------------------------------------------------------------------

/**
 * Return a human-readable relative time string (Korean).
 * e.g. "방금 전", "3분 전", "2시간 전", "어제", "3일 전", "2주 전", "2025-01-15"
 *
 * @param {Date|string|number} date
 * @returns {string}
 */
export function relativeDate(date) {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffWeek = Math.floor(diffDay / 7);

  if (diffSec < 60) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHour < 24) return `${diffHour}시간 전`;
  if (diffDay === 1) return '어제';
  if (diffDay < 7) return `${diffDay}일 전`;
  if (diffWeek < 5) return `${diffWeek}주 전`;

  // Fall back to yyyy-MM-dd
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Format a Date as ISO date string (yyyy-MM-dd).
 * @param {Date|string|number} date
 * @returns {string}
 */
export function formatDate(date) {
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Get the start of day (midnight) for a given date.
 * @param {Date} date
 * @returns {Date}
 */
export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get the ISO week identifier "yyyy-Www" for a date.
 * @param {Date} date
 * @returns {{ key: string, weekStart: Date }}
 */
export function getISOWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // Set to nearest Thursday (ISO week definition)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNumber = Math.ceil(
    ((d - yearStart) / 86400000 + 1) / 7
  );
  const key = `${d.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`;

  // Compute Monday of that week
  const weekStart = new Date(date);
  weekStart.setHours(0, 0, 0, 0);
  const day = weekStart.getDay();
  const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
  weekStart.setDate(diff);

  return { key, weekStart };
}

// ---------------------------------------------------------------------------
// Text Helpers
// ---------------------------------------------------------------------------

/**
 * Trim whitespace and newlines from both ends.
 * @param {string} str
 * @returns {string}
 */
export function trimmed(str) {
  return (str || '').trim();
}

/**
 * Detect whether text is primarily Korean.
 * @param {string} text
 * @returns {boolean}
 */
export function isKorean(text) {
  return /[\uAC00-\uD7A3]/.test(text);
}

/**
 * Tokenize text into words, filtering out short tokens.
 * @param {string} text
 * @param {number} minLength  Minimum token length (default 2)
 * @returns {string[]}
 */
export function tokenize(text, minLength = 2) {
  return text
    .toLowerCase()
    .split(/[^a-zA-Z0-9\uAC00-\uD7A3]+/)
    .filter((w) => w.length >= minLength);
}

/**
 * Extract top-N keywords using TF-IDF style scoring with domain boost.
 * Port of Swift `topKeywords(from:maxCount:)`.
 *
 * @param {string} body
 * @param {number} maxCount
 * @returns {string[]}
 */
export function topKeywords(body, maxCount = 5) {
  const korean = isKorean(body);
  const stopwords = korean ? KOREAN_STOPWORDS : ENGLISH_STOPWORDS;

  const tokens = tokenize(body);

  // Term frequency
  const termFreq = {};
  for (const token of tokens) {
    if (stopwords.has(token)) continue;
    if (token.length < 2 || token.length > 20) continue;
    if (/^\d+$/.test(token)) continue;
    termFreq[token] = (termFreq[token] || 0) + 1;
  }

  const totalTokens = tokens.length || 1;

  // Score with domain boost
  const scored = Object.entries(termFreq).map(([term, freq]) => {
    let score = (freq / totalTokens) * 100;

    // Domain keyword boost
    if (ACTING_KEYWORDS.has(term)) {
      score *= 2.5;
    }

    // Length preference
    if (term.length >= 5) score *= 1.3;
    if (term.length >= 8) score *= 1.2;

    // Frequency boost
    if (freq >= 3) score *= 1.5;

    return [term, score];
  });

  return scored
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxCount)
    .map(([term]) => term);
}

/**
 * Split text into sentences. Handles Korean and English punctuation.
 * Port of Swift `splitSentences`.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function splitSentences(text) {
  const sentences = [];
  let current = '';

  for (const char of text) {
    current += char;

    const isSentenceEnd = ['.', '!', '?', '\u3002', '\uFF01', '\uFF1F'].includes(char);
    const isAbbreviation = current.length < 5 && char === '.';

    if (isSentenceEnd && !isAbbreviation) {
      const t = current.trim();
      if (t.length >= 12) {
        sentences.push(t);
      }
      current = '';
    }
  }

  const remaining = current.trim();
  if (remaining.length >= 12) {
    sentences.push(remaining);
  }

  return sentences;
}

/**
 * Extract hash-tags from note body (e.g. #monologue, #beat).
 * @param {string} body
 * @returns {string[]}
 */
export function extractHashtags(body) {
  const regex = /#\w+/g;
  const matches = body.match(regex) || [];
  return matches.map((m) => m.slice(1)); // strip leading #
}

/**
 * Count words in text.
 * @param {string} text
 * @returns {number}
 */
export function wordCount(text) {
  return (text || '')
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

/**
 * Create a blank note object.
 * @param {string} field
 * @returns {Object}
 */
export function blankNote(field = 'acting') {
  return {
    id: generateUUID(),
    title: '',
    body: '',
    starred: false,
    updatedAt: new Date().toISOString(),
    aiComment: null,
    field,
    tags: [],
    seriesName: null,
  };
}

/**
 * Create a blank user profile object.
 * @returns {Object}
 */
export function emptyUserProfile() {
  return {
    name: '',
    email: '',
    fields: [],
    userType: '',
    roleModels: [],
    interests: [],
  };
}

/**
 * Generate a UUID v4 string.
 * @returns {string}
 */
export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
