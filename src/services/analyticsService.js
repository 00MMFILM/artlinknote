/**
 * analyticsService.js
 *
 * Artist profile analytics, related notes recommendation, and series detection
 * for Artlink React Native.
 *
 * Pure JavaScript, no external dependencies. Operates on note arrays
 * and user profile objects.
 */

import { FIELD_KEYS, startOfDay, getISOWeek } from '../utils/helpers';

// ---------------------------------------------------------------------------
// ArtistProfile shape (returned by computeArtistProfile)
// ---------------------------------------------------------------------------
//
// {
//   streak:      number,       // consecutive days with notes from today
//   fieldCounts: { acting: n, music: n, ... },
//   scores: {
//     volume:      number,  // 0-100  recording volume
//     aiUsage:     number,  // 0-100  AI utilization rate
//     diversity:   number,  // 0-100  field diversity
//     depth:       number,  // 0-100  average body length
//     consistency: number,  // 0-100  recent 30-day activity
//   },
//   weeklyStats: [ { id, weekStart, count, fields } ],
//   totalNotes:  number,
// }

// ---------------------------------------------------------------------------
// computeStreak
// ---------------------------------------------------------------------------

/**
 * Count consecutive days with at least one note, going backwards from today.
 *
 * @param {Array} notes - Array of note objects with `updatedAt` dates
 * @returns {number}
 */
function computeStreak(notes) {
  if (notes.length === 0) return 0;

  const today = startOfDay(new Date());

  // Collect unique day timestamps
  const daysWithNotes = new Set();
  for (const note of notes) {
    const day = startOfDay(new Date(note.updatedAt)).getTime();
    daysWithNotes.add(day);
  }

  let streak = 0;
  let checkDate = today.getTime();
  const ONE_DAY = 86400000;

  while (daysWithNotes.has(checkDate)) {
    streak += 1;
    checkDate -= ONE_DAY;
  }

  return streak;
}

// ---------------------------------------------------------------------------
// computeFieldCounts
// ---------------------------------------------------------------------------

/**
 * Count notes per field.
 *
 * @param {Array} notes
 * @returns {Object} e.g. { acting: 5, music: 3 }
 */
function computeFieldCounts(notes) {
  const counts = {};
  for (const note of notes) {
    counts[note.field] = (counts[note.field] || 0) + 1;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// computeSkillScores  (5-axis, each 0-100)
// ---------------------------------------------------------------------------

/**
 * Compute 5-axis skill scores.
 *
 * 1. Volume (기록량)     -- total notes / 100 * 100, capped at 100
 * 2. AI Usage (AI활용)   -- notes with aiComment / total * 100
 * 3. Diversity (다양성)  -- unique fields used / total field count * 100
 * 4. Depth (깊이)        -- avg body length / 500 * 100, capped at 100
 * 5. Consistency (꾸준함) -- days with notes in last 30 days / 30 * 100
 *
 * @param {Array}  notes
 * @param {Object} _profile  (reserved for future extensions)
 * @returns {{ volume, aiUsage, diversity, depth, consistency }}
 */
function computeSkillScores(notes, _profile) {
  if (notes.length === 0) {
    return { volume: 0, aiUsage: 0, diversity: 0, depth: 0, consistency: 0 };
  }

  // 1. Volume
  const volume = Math.min((notes.length / 100) * 100, 100);

  // 2. AI Usage
  const aiCount = notes.filter(
    (n) => n.aiComment && n.aiComment.trim().length > 0
  ).length;
  const aiUsage = Math.min((aiCount / notes.length) * 100, 100);

  // 3. Diversity
  const uniqueFields = new Set(notes.map((n) => n.field));
  const totalFieldTypes = FIELD_KEYS.length; // 6
  const diversity = (uniqueFields.size / totalFieldTypes) * 100;

  // 4. Depth
  const totalBodyLength = notes.reduce((sum, n) => sum + (n.body || '').length, 0);
  const avgBodyLength = totalBodyLength / notes.length;
  const depth = Math.min((avgBodyLength / 500) * 100, 100);

  // 5. Consistency (last 30 days)
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  const recentNotes = notes.filter(
    (n) => new Date(n.updatedAt) >= thirtyDaysAgo
  );
  const recentDays = new Set(
    recentNotes.map((n) => startOfDay(new Date(n.updatedAt)).getTime())
  );
  const consistency = Math.min((recentDays.size / 30) * 100, 100);

  return { volume, aiUsage, diversity, depth, consistency };
}

// ---------------------------------------------------------------------------
// computeWeeklyStats
// ---------------------------------------------------------------------------

/**
 * Aggregate notes into weekly buckets with counts and field sets.
 *
 * @param {Array} notes
 * @returns {Array<{ id: string, weekStart: Date, count: number, fields: Set<string> }>}
 *   Sorted by weekStart ascending.
 */
function computeWeeklyStats(notes) {
  const weekMap = {};

  for (const note of notes) {
    const { key, weekStart } = getISOWeek(new Date(note.updatedAt));

    if (weekMap[key]) {
      weekMap[key].count += 1;
      weekMap[key].fields.add(note.field);
    } else {
      weekMap[key] = {
        id: key,
        weekStart,
        count: 1,
        fields: new Set([note.field]),
      };
    }
  }

  return Object.values(weekMap).sort(
    (a, b) => a.weekStart - b.weekStart
  );
}

// ---------------------------------------------------------------------------
// computeArtistProfile  (main public function)
// ---------------------------------------------------------------------------

/**
 * Compute the full artist profile analytics object.
 *
 * @param {Array}  notes       - All notes
 * @param {Object} userProfile - User profile ({ name, roleModels, ... })
 * @returns {Object} ArtistProfile
 */
export function computeArtistProfile(notes = [], userProfile = {}) {
  const streak = computeStreak(notes);
  const fieldCounts = computeFieldCounts(notes);
  const scores = computeSkillScores(notes, userProfile);
  const weeklyStats = computeWeeklyStats(notes);

  return {
    streak,
    fieldCounts,
    scores,
    weeklyStats,
    totalNotes: notes.length,
  };
}

// ---------------------------------------------------------------------------
// getRelatedNotes
// ---------------------------------------------------------------------------

/**
 * Recommend related notes based on field, tags, series, and title similarity.
 *
 * Scoring:
 *   - Same field:          +3
 *   - Each shared tag:     +2
 *   - Same series:         +5
 *   - Title similarity:    Jaccard on words * 4
 *   - Recency (< 7 days):  +1 ;  (< 30 days): +0.5
 *
 * @param {Object} note       - The reference note
 * @param {Array}  allNotes   - All notes to search through
 * @param {number} maxResults - Maximum related notes to return (default 5)
 * @returns {Array<{ note: Object, score: number }>}  Sorted by score descending
 */
export function getRelatedNotes(note, allNotes, maxResults = 5) {
  const scored = [];

  for (const candidate of allNotes) {
    if (candidate.id === note.id) continue;

    let score = 0;

    // Same field: +3
    if (candidate.field === note.field) {
      score += 3.0;
    }

    // Shared tags: +2 each
    const noteTags = new Set(note.tags || []);
    const candidateTags = new Set(candidate.tags || []);
    for (const tag of noteTags) {
      if (candidateTags.has(tag)) {
        score += 2.0;
      }
    }

    // Same series: +5
    if (
      note.seriesName &&
      note.seriesName.trim().length > 0 &&
      candidate.seriesName === note.seriesName
    ) {
      score += 5.0;
    }

    // Title similarity: Jaccard on words * 4
    const noteWords = new Set(
      (note.title || '')
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length >= 2)
    );
    const candidateWords = new Set(
      (candidate.title || '')
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length >= 2)
    );

    if (noteWords.size > 0 && candidateWords.size > 0) {
      let intersectionSize = 0;
      for (const w of noteWords) {
        if (candidateWords.has(w)) intersectionSize++;
      }
      const unionSize = new Set([...noteWords, ...candidateWords]).size;
      const jaccard = intersectionSize / unionSize;
      score += jaccard * 4.0;
    }

    // Recency bonus
    const daysSinceUpdate =
      (Date.now() - new Date(candidate.updatedAt).getTime()) / 86400000;
    if (daysSinceUpdate < 7) {
      score += 1.0;
    } else if (daysSinceUpdate < 30) {
      score += 0.5;
    }

    if (score > 0) {
      scored.push({ note: candidate, score });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

// ---------------------------------------------------------------------------
// getNoteSeries
// ---------------------------------------------------------------------------

/**
 * Group notes into series.
 *
 * Two detection modes:
 *   1. Explicit: notes with matching `seriesName`
 *   2. Implicit: notes without seriesName whose titles share a common prefix
 *      before separators (: - -- | #). Implicit groups require 2+ notes
 *      and are labeled with "(auto)" suffix.
 *
 * @param {Array} allNotes
 * @returns {Object<string, Array>}  Map of seriesName -> sorted notes array
 */
export function getNoteSeries(allNotes) {
  const seriesMap = {};

  // 1. Explicit series
  for (const note of allNotes) {
    if (note.seriesName && note.seriesName.trim().length > 0) {
      if (!seriesMap[note.seriesName]) {
        seriesMap[note.seriesName] = [];
      }
      seriesMap[note.seriesName].push(note);
    }
  }

  // 2. Implicit series by common title prefixes
  const unseriedNotes = allNotes.filter(
    (n) => !n.seriesName || n.seriesName.trim().length === 0
  );

  const separators = [':', ' -', ' \u2013', ' \u2014', '#', ' |'];
  const prefixGroups = {};

  for (const note of unseriedNotes) {
    for (const sep of separators) {
      const idx = note.title.indexOf(sep);
      if (idx !== -1) {
        const prefix = note.title.substring(0, idx).trim();
        if (prefix.length >= 2 && prefix.length <= 30) {
          if (!prefixGroups[prefix]) {
            prefixGroups[prefix] = [];
          }
          prefixGroups[prefix].push(note);
        }
        break; // only match first separator
      }
    }
  }

  // Only keep prefix groups with 2+ notes
  for (const [prefix, notes] of Object.entries(prefixGroups)) {
    if (notes.length >= 2) {
      const key = `${prefix} (auto)`;
      seriesMap[key] = notes;
    }
  }

  // Sort notes within each series by updatedAt ascending
  for (const key of Object.keys(seriesMap)) {
    seriesMap[key].sort(
      (a, b) => new Date(a.updatedAt) - new Date(b.updatedAt)
    );
  }

  return seriesMap;
}

// ---------------------------------------------------------------------------
// Monthly aggregation helper
// ---------------------------------------------------------------------------

/**
 * Aggregate notes into monthly buckets.
 *
 * @param {Array} notes
 * @returns {Array<{ month: string, count: number, fields: Set<string> }>}
 *   month format: "yyyy-MM", sorted ascending.
 */
export function computeMonthlyStats(notes) {
  const monthMap = {};

  for (const note of notes) {
    const d = new Date(note.updatedAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    if (monthMap[key]) {
      monthMap[key].count += 1;
      monthMap[key].fields.add(note.field);
    } else {
      monthMap[key] = {
        month: key,
        count: 1,
        fields: new Set([note.field]),
      };
    }
  }

  return Object.values(monthMap).sort((a, b) =>
    a.month.localeCompare(b.month)
  );
}
